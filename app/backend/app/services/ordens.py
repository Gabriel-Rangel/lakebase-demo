"""Ordens de Serviço (OS) e Permissões de Trabalho (PT) — OLTP no Lakebase.

Padrões demonstrados:
  • lock otimista (coluna version)      → HTTP 409 quando duas pessoas editam a mesma OS
  • SELECT ... FOR UPDATE + transação   → mudança de status e histórico gravados atomicamente
  • regras no banco (CHECK/UNIQUE)      → segregação de funções e 1 PT ativa por OS
"""
from typing import Any, Optional

from psycopg import sql
from psycopg.types.json import Jsonb

from .. import db
from ..erros import conflito, invalido, nao_encontrado
from . import equipamentos as equipamentos_srv

FINAIS_OS = ("CONCLUIDA", "CANCELADA")
TRANSICOES_MANUAIS = {
    "ABERTA": {"PLANEJADA", "CANCELADA"},
    "PLANEJADA": {"AGUARDANDO_PT", "CANCELADA"},
    "AGUARDANDO_PT": {"CANCELADA"},
}
PAPEIS_APROVADORES = ("SUPERVISOR", "SEGURANCA")

# {origem}: a tabela inteira (detalhe) ou só a página já filtrada/limitada (listagem)
SELECT_OS = """
SELECT o.id, o.numero, o.equipamento_tag, o.unidade, o.tipo, o.prioridade, o.status, o.origem,
       o.titulo, o.descricao, o.solicitante_id, us.nome AS solicitante_nome,
       o.responsavel_id, ur.nome AS responsavel_nome,
       o.data_abertura, o.data_prevista, o.data_inicio, o.data_conclusao, o.horas_indisponivel,
       o.version, o.atualizado_em,
       pt.id AS pt_id, pt.numero AS pt_numero, pt.status AS pt_status, pt.tipo AS pt_tipo {extra}
FROM {origem} o
JOIN operacao.usuarios us ON us.id = o.solicitante_id
LEFT JOIN operacao.usuarios ur ON ur.id = o.responsavel_id
LEFT JOIN LATERAL (
    SELECT p.id, p.numero, p.status, p.tipo FROM operacao.permissoes_trabalho p
    WHERE p.ordem_id = o.id AND p.status IN ('SOLICITADA', 'APROVADA', 'EM_EXECUCAO')
    ORDER BY p.id DESC LIMIT 1
) pt ON true
"""


def _select_pt() -> str:
    loto = ", pt.requer_loto" if db.schema_version() >= 3 else ""
    return f"""
SELECT pt.id, pt.numero, pt.ordem_id, o.numero AS ordem_numero, o.titulo AS ordem_titulo,
       o.equipamento_tag, o.unidade, pt.tipo, pt.status, pt.riscos, pt.medidas_controle, pt.validade_horas,
       pt.solicitante_id, us.nome AS solicitante_nome, pt.aprovador_id, ua.nome AS aprovador_nome,
       pt.comentario_decisao, pt.validade_inicio, pt.validade_fim, pt.criada_em, pt.decidida_em, pt.version{loto}
FROM operacao.permissoes_trabalho pt
JOIN operacao.ordens_servico o ON o.id = pt.ordem_id
JOIN operacao.usuarios us ON us.id = pt.solicitante_id
LEFT JOIN operacao.usuarios ua ON ua.id = pt.aprovador_id
"""


# ---------------------------------------------------------------------------
# Formatação
# ---------------------------------------------------------------------------
def _formatar_os(linha: dict) -> dict:
    o = {k: v for k, v in linha.items() if not k.startswith("pt_") and k != "total"}
    o["equipamento_nome"] = equipamentos_srv.mapa_nomes().get(o["equipamento_tag"], {}).get("nome")
    if o.get("horas_indisponivel") is not None:
        o["horas_indisponivel"] = float(o["horas_indisponivel"])
    o["pt_ativa"] = (
        {"id": linha["pt_id"], "numero": linha["pt_numero"], "status": linha["pt_status"], "tipo": linha["pt_tipo"]}
        if linha.get("pt_id") else None
    )
    return o


def _bloqueios(conn, ids_pt: list[int]) -> dict[int, list[dict]]:
    if db.schema_version() < 3 or not ids_pt:
        return {}
    linhas = conn.execute(
        """SELECT b.id, b.permissao_id, b.ponto_isolamento, b.tipo_energia, b.cadeado_numero,
                  u.nome AS aplicado_por_nome, b.aplicado_em, b.removido_em
           FROM operacao.bloqueios_loto b JOIN operacao.usuarios u ON u.id = b.aplicado_por
           WHERE b.permissao_id = ANY(%s) ORDER BY b.id""",
        (ids_pt,),
    ).fetchall()
    por_pt: dict[int, list[dict]] = {}
    for b in linhas:
        por_pt.setdefault(b["permissao_id"], []).append(b)
    return por_pt


def _formatar_pts(conn, linhas: list[dict]) -> list[dict]:
    bloqueios = _bloqueios(conn, [l["id"] for l in linhas])
    saida = []
    for l in linhas:
        p = dict(l)
        if db.schema_version() >= 3:
            p["bloqueios"] = bloqueios.get(l["id"], [])
        saida.append(p)
    return saida


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------
def listar_os(status=None, unidade=None, prioridade=None, busca=None, equipamento_tag=None, limite=50, offset=0):
    filtros, params = [], []
    for coluna, valor in (("o.status", status), ("o.unidade", unidade), ("o.prioridade", prioridade),
                          ("o.equipamento_tag", equipamento_tag)):
        if valor:
            filtros.append(f"{coluna} = %s")
            params.append(valor)
    if busca:
        filtros.append("(o.numero ILIKE %s OR o.titulo ILIKE %s OR o.equipamento_tag ILIKE %s)")
        params += [f"%{busca}%"] * 3
    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    # filtra e pagina primeiro; os JOINs/LATERAL rodam só nas linhas da página (escala para centenas de milhares de OS)
    pagina = f"(SELECT * FROM operacao.ordens_servico o {where} ORDER BY o.data_abertura DESC LIMIT %s OFFSET %s)"
    total = f", (SELECT count(*) FROM operacao.ordens_servico o {where}) AS total"
    linhas = db.consultar(SELECT_OS.format(origem=pagina, extra=total) + " ORDER BY o.data_abertura DESC",
                          (*params, *params, limite, offset))
    total = linhas[0]["total"] if linhas else 0
    return {"itens": [_formatar_os(l) for l in linhas], "total": total}


def obter_os(conn, os_id: int) -> dict:
    linha = conn.execute(SELECT_OS.format(origem="operacao.ordens_servico", extra="") + " WHERE o.id = %s", (os_id,)).fetchone()
    if not linha:
        raise nao_encontrado(f"OS {os_id} não encontrada")
    return _formatar_os(linha)


def detalhe_os(os_id: int) -> dict:
    with db.leitura() as conn:
        ordem = obter_os(conn, os_id)
        historico = conn.execute(
            """SELECT h.id, h.entidade, h.entidade_id, h.de_status, h.para_status, u.nome AS usuario_nome,
                      h.comentario, h.criado_em
               FROM operacao.historico_status h LEFT JOIN operacao.usuarios u ON u.id = h.usuario_id
               WHERE (h.entidade = 'OS' AND h.entidade_id = %s)
                  OR (h.entidade = 'PT' AND h.entidade_id IN (SELECT id FROM operacao.permissoes_trabalho WHERE ordem_id = %s))
               ORDER BY h.criado_em, h.id""",
            (os_id, os_id),
        ).fetchall()
        pts = conn.execute(f"{_select_pt()} WHERE pt.ordem_id = %s ORDER BY pt.id DESC", (os_id,)).fetchall()
        return {"ordem": ordem, "historico": historico, "permissoes": _formatar_pts(conn, pts)}


def listar_pts(status=None, unidade=None) -> dict:
    filtros, params = [], []
    if status:
        filtros.append("pt.status = %s")
        params.append(status)
    if unidade:
        filtros.append("o.unidade = %s")
        params.append(unidade)
    where = f"WHERE {' AND '.join(filtros)}" if filtros else "WHERE pt.criada_em > now() - interval '30 days' OR pt.status IN ('SOLICITADA','APROVADA','EM_EXECUCAO')"
    with db.leitura() as conn:
        linhas = conn.execute(f"{_select_pt()} {where} ORDER BY pt.criada_em DESC LIMIT 200", params).fetchall()
        return {"itens": _formatar_pts(conn, linhas)}


def obter_pt(conn, pt_id: int) -> dict:
    linha = conn.execute(f"{_select_pt()} WHERE pt.id = %s", (pt_id,)).fetchone()
    if not linha:
        raise nao_encontrado(f"PT {pt_id} não encontrada")
    return _formatar_pts(conn, [linha])[0]


# ---------------------------------------------------------------------------
# Escrita — sempre em transação, com FOR UPDATE + histórico
# ---------------------------------------------------------------------------
def _usuario(conn, usuario_id: int) -> dict:
    u = conn.execute("SELECT id, nome, papel FROM operacao.usuarios WHERE id = %s AND ativo", (usuario_id,)).fetchone()
    if not u:
        raise invalido(f"Usuário {usuario_id} inválido")
    return u


def _registrar(conn, entidade: str, entidade_id: int, de: Optional[str], para: str, usuario_id: int,
               comentario: Optional[str] = None) -> None:
    conn.execute(
        "INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (entidade, entidade_id, de, para, usuario_id, comentario),
    )


def _travar(conn, tabela: str, registro_id: int, version: Optional[int], rotulo: str) -> dict:
    linha = conn.execute(
        sql.SQL("SELECT * FROM operacao.{} WHERE id = %s FOR UPDATE").format(sql.Identifier(tabela)), (registro_id,)
    ).fetchone()
    if not linha:
        raise nao_encontrado(f"{rotulo} {registro_id} não encontrada")
    if version is not None and linha["version"] != version:
        raise conflito(
            f"Esta {rotulo} foi alterada por outra pessoa (versão {linha['version']}). Recarregue os dados.",
            linha["version"],
        )
    return linha


def _mudar_status_os(conn, os_linha: dict, para: str, usuario_id: int, comentario=None, extra: str = "", params=()):
    conn.execute(
        f"UPDATE operacao.ordens_servico SET status = %s, version = version + 1, atualizado_em = now() {extra} WHERE id = %s",
        (para, *params, os_linha["id"]),
    )
    _registrar(conn, "OS", os_linha["id"], os_linha["status"], para, usuario_id, comentario)


def criar_os(dados: dict) -> dict:
    eq = equipamentos_srv.mapa_nomes().get(dados["equipamento_tag"])
    if not eq:
        raise invalido(f"Equipamento {dados['equipamento_tag']} não existe no cadastro")
    with db.conexao() as conn:
        _usuario(conn, dados["solicitante_id"])
        os_id = conn.execute(
            """INSERT INTO operacao.ordens_servico
               (equipamento_tag, unidade, tipo, prioridade, origem, titulo, descricao, solicitante_id, data_prevista)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (dados["equipamento_tag"], eq["unidade"], dados["tipo"], dados["prioridade"], dados.get("origem", "MANUAL"),
             dados["titulo"], dados.get("descricao"), dados["solicitante_id"], dados.get("data_prevista")),
        ).fetchone()["id"]
        _registrar(conn, "OS", os_id, None, "ABERTA", dados["solicitante_id"], dados.get("comentario"))
        return obter_os(conn, os_id)


def atualizar_os(os_id: int, version: int, usuario_id: int, campos: dict[str, Any]) -> dict:
    editaveis = {k: v for k, v in campos.items() if k in ("titulo", "descricao", "prioridade", "responsavel_id", "data_prevista")}
    with db.conexao() as conn:
        _usuario(conn, usuario_id)
        linha = _travar(conn, "ordens_servico", os_id, version, "OS")
        if linha["status"] in FINAIS_OS:
            raise invalido("OS finalizada não pode ser editada")
        if editaveis:
            sets = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in editaveis)
            conn.execute(
                sql.SQL("UPDATE operacao.ordens_servico SET {}, version = version + 1, atualizado_em = now() WHERE id = %s")
                .format(sets),
                (*editaveis.values(), os_id),
            )
        return obter_os(conn, os_id)


def transicionar_os(os_id: int, para: str, usuario_id: int, version: int, comentario: Optional[str]) -> dict:
    with db.conexao() as conn:
        _usuario(conn, usuario_id)
        linha = _travar(conn, "ordens_servico", os_id, version, "OS")
        if para not in TRANSICOES_MANUAIS.get(linha["status"], set()):
            if para in ("EM_EXECUCAO", "CONCLUIDA"):
                raise invalido("Início e conclusão da OS acontecem pela permissão de trabalho (iniciar / encerrar)")
            raise invalido(f"Transição {linha['status']} → {para} não permitida")
        if para == "CANCELADA":
            pendentes = conn.execute(
                "SELECT id, status FROM operacao.permissoes_trabalho WHERE ordem_id = %s AND status IN ('SOLICITADA', 'APROVADA') FOR UPDATE",
                (os_id,),
            ).fetchall()
            for pt in pendentes:
                conn.execute("UPDATE operacao.permissoes_trabalho SET status = 'CANCELADA', version = version + 1, "
                             "atualizado_em = now() WHERE id = %s", (pt["id"],))
                _registrar(conn, "PT", pt["id"], pt["status"], "CANCELADA", usuario_id, "OS cancelada")
        _mudar_status_os(conn, linha, para, usuario_id, comentario)
        return obter_os(conn, os_id)


def criar_pt(dados: dict) -> dict:
    with db.conexao() as conn:
        _usuario(conn, dados["solicitante_id"])
        os_linha = _travar(conn, "ordens_servico", dados["ordem_id"], None, "OS")
        if os_linha["status"] not in ("PLANEJADA", "AGUARDANDO_PT"):
            raise invalido("A OS precisa estar PLANEJADA ou AGUARDANDO_PT para solicitar uma PT")
        em_andamento = conn.execute(
            "SELECT numero FROM operacao.permissoes_trabalho WHERE ordem_id = %s AND status IN ('SOLICITADA','APROVADA','EM_EXECUCAO')",
            (dados["ordem_id"],),
        ).fetchone()
        if em_andamento:
            raise conflito(f"A OS já tem a PT {em_andamento['numero']} em andamento")
        colunas = ["ordem_id", "tipo", "riscos", "medidas_controle", "validade_horas", "solicitante_id"]
        valores = [dados["ordem_id"], dados["tipo"], Jsonb(dados.get("riscos", [])),
                   dados.get("medidas_controle"), dados.get("validade_horas", 8), dados["solicitante_id"]]
        if db.schema_version() >= 3:
            colunas.append("requer_loto")
            valores.append(bool(dados.get("requer_loto")))
        pt_id = conn.execute(
            sql.SQL("INSERT INTO operacao.permissoes_trabalho ({}) VALUES ({}) RETURNING id").format(
                sql.SQL(", ").join(map(sql.Identifier, colunas)), sql.SQL(", ").join(sql.Placeholder() * len(colunas))
            ),
            valores,
        ).fetchone()["id"]
        _registrar(conn, "PT", pt_id, None, "SOLICITADA", dados["solicitante_id"])
        if os_linha["status"] == "PLANEJADA":
            _mudar_status_os(conn, os_linha, "AGUARDANDO_PT", dados["solicitante_id"], "PT solicitada")
        return obter_pt(conn, pt_id)


def decidir_pt(pt_id: int, acao: str, usuario_id: int, version: int, comentario: Optional[str] = None,
               horas_indisponivel: Optional[float] = None) -> dict:
    with db.conexao() as conn:
        usuario = _usuario(conn, usuario_id)
        pt = _travar(conn, "permissoes_trabalho", pt_id, version, "PT")
        os_linha = _travar(conn, "ordens_servico", pt["ordem_id"], None, "OS")
        de = pt["status"]

        if acao in ("aprovar", "rejeitar"):
            if de != "SOLICITADA":
                raise invalido(f"Só é possível {acao} uma PT SOLICITADA (atual: {de})")
            if usuario["papel"] not in PAPEIS_APROVADORES:
                raise invalido("Somente Supervisor ou Segurança podem aprovar/rejeitar uma PT")
            if acao == "rejeitar" and not comentario:
                raise invalido("Informe o motivo da rejeição")
            para = "APROVADA" if acao == "aprovar" else "REJEITADA"
            # a segregação de funções (aprovador ≠ solicitante) e "1 PT ativa por OS" são garantidas pelo banco
            conn.execute(
                """UPDATE operacao.permissoes_trabalho
                   SET status = %s, aprovador_id = %s, comentario_decisao = %s, decidida_em = now(),
                       validade_inicio = CASE WHEN %s = 'APROVADA' THEN now() END,
                       validade_fim = CASE WHEN %s = 'APROVADA' THEN now() + make_interval(hours => validade_horas) END,
                       version = version + 1, atualizado_em = now()
                   WHERE id = %s""",
                (para, usuario_id, comentario, para, para, pt_id),
            )

        elif acao == "iniciar":
            if de != "APROVADA":
                raise invalido(f"Só é possível iniciar uma PT APROVADA (atual: {de})")
            if pt["validade_fim"] and conn.execute("SELECT now() > %s AS v", (pt["validade_fim"],)).fetchone()["v"]:
                raise invalido("PT vencida — solicite uma nova permissão")
            if db.schema_version() >= 3 and pt.get("requer_loto"):
                ativos = conn.execute(
                    "SELECT count(*) AS n FROM operacao.bloqueios_loto WHERE permissao_id = %s AND removido_em IS NULL", (pt_id,)
                ).fetchone()["n"]
                if not ativos:
                    raise invalido("Esta PT exige bloqueio LOTO: aplique ao menos um cadeado antes de iniciar")
            para = "EM_EXECUCAO"
            conn.execute("UPDATE operacao.permissoes_trabalho SET status = %s, version = version + 1, atualizado_em = now() WHERE id = %s",
                         (para, pt_id))
            if os_linha["status"] == "AGUARDANDO_PT":
                _mudar_status_os(conn, os_linha, "EM_EXECUCAO", usuario_id, f"Início autorizado pela {pt['numero']}",
                                 ", data_inicio = now()")

        elif acao == "encerrar":
            if de != "EM_EXECUCAO":
                raise invalido(f"Só é possível encerrar uma PT EM_EXECUCAO (atual: {de})")
            if db.schema_version() >= 3:
                ativos = conn.execute(
                    "SELECT count(*) AS n FROM operacao.bloqueios_loto WHERE permissao_id = %s AND removido_em IS NULL", (pt_id,)
                ).fetchone()["n"]
                if ativos:
                    raise invalido("Remova todos os bloqueios LOTO antes de encerrar a PT")
            para = "ENCERRADA"
            conn.execute("UPDATE operacao.permissoes_trabalho SET status = %s, version = version + 1, atualizado_em = now() WHERE id = %s",
                         (para, pt_id))
            if os_linha["status"] == "EM_EXECUCAO":
                _mudar_status_os(
                    conn, os_linha, "CONCLUIDA", usuario_id, comentario,
                    ", data_conclusao = now(), horas_indisponivel = coalesce(%s, round(extract(epoch FROM now() - data_inicio) / 3600.0, 2))",
                    (horas_indisponivel,),
                )
        else:
            raise invalido(f"Ação {acao} desconhecida")

        _registrar(conn, "PT", pt_id, de, para, usuario_id, comentario)
        return obter_pt(conn, pt_id)


def aplicar_bloqueio(pt_id: int, dados: dict) -> dict:
    if db.schema_version() < 3:
        raise nao_encontrado("Bloqueios LOTO disponíveis a partir da migração 003 (Extra 1)")
    with db.conexao() as conn:
        _usuario(conn, dados["usuario_id"])
        pt = _travar(conn, "permissoes_trabalho", pt_id, None, "PT")
        if pt["status"] not in ("APROVADA", "EM_EXECUCAO"):
            raise invalido("Bloqueios só podem ser aplicados em PT aprovada ou em execução")
        b_id = conn.execute(
            """INSERT INTO operacao.bloqueios_loto (permissao_id, ponto_isolamento, tipo_energia, cadeado_numero, aplicado_por)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (pt_id, dados["ponto_isolamento"], dados["tipo_energia"], dados["cadeado_numero"], dados["usuario_id"]),
        ).fetchone()["id"]
        _registrar(conn, "PT", pt_id, None, "LOTO_APLICADO", dados["usuario_id"],
                   f"Cadeado {dados['cadeado_numero']} em {dados['ponto_isolamento']}")
        return next(b for b in _bloqueios(conn, [pt_id])[pt_id] if b["id"] == b_id)


def remover_bloqueio(pt_id: int, bloqueio_id: int, usuario_id: int) -> dict:
    if db.schema_version() < 3:
        raise nao_encontrado("Bloqueios LOTO disponíveis a partir da migração 003 (Extra 1)")
    with db.conexao() as conn:
        _usuario(conn, usuario_id)
        linha = conn.execute(
            """UPDATE operacao.bloqueios_loto SET removido_em = now(), removido_por = %s
               WHERE id = %s AND permissao_id = %s AND removido_em IS NULL RETURNING cadeado_numero""",
            (usuario_id, bloqueio_id, pt_id),
        ).fetchone()
        if not linha:
            raise nao_encontrado("Bloqueio não encontrado ou já removido")
        _registrar(conn, "PT", pt_id, None, "LOTO_REMOVIDO", usuario_id, f"Cadeado {linha['cadeado_numero']} removido")
        return next(b for b in _bloqueios(conn, [pt_id])[pt_id] if b["id"] == bloqueio_id)
