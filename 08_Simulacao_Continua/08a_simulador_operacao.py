# Databricks notebook source
# MAGIC %md
# MAGIC # 8️⃣ Passo 8a · Simulador de operação — 10 OS por minuto
# MAGIC
# MAGIC Simula os FPSOs em operação: **técnicos abrindo OS** e o fluxo de trabalho andando sozinho
# MAGIC (planejar → solicitar PT → aprovar → executar → concluir). Tudo gravado no **Lakebase**, como faria o app.
# MAGIC
# MAGIC | Parâmetro | Padrão | |
# MAGIC |---|---|---|
# MAGIC | `os_por_minuto` | 10 | novas OS por minuto |
# MAGIC | `avancos_por_minuto` | 60 | passos de workflow por minuto — cada OS precisa de 5; acima de 5 × `os_por_minuto` o backlog fica estável |
# MAGIC | `duracao_min` | 60 | `0` = até cancelar o job |
# MAGIC
# MAGIC 🧠 **Comportamento realista:** equipamentos com risco **ALTO/CRÍTICO** no Lakehouse (synced table `analitico.saude_equipamentos`)
# MAGIC recebem mais OS corretivas — e cada corretiva aberta reduz o health score na próxima volta do enriquecimento (Passo 8b).
# MAGIC
# MAGIC > ▶️ Roda como a tarefa `simular_operacao` do job **Passo 8 · Simulação contínua** (em paralelo com o `08b`).
# MAGIC > Enquanto roda, deixe o app aberto no **Painel** (atualização automática a cada 10 s).

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.text("os_por_minuto", "10", "Novas OS por minuto")
dbutils.widgets.text("avancos_por_minuto", "60", "Avanços de workflow por minuto")
dbutils.widgets.text("duracao_min", "60", "Duração (min, 0 = sem fim)")
OS_POR_MINUTO = float(dbutils.widgets.get("os_por_minuto"))
AVANCOS_POR_MINUTO = float(dbutils.widgets.get("avancos_por_minuto"))
DURACAO_MIN = float(dbutils.widgets.get("duracao_min"))

# COMMAND ----------

import json
import random
import time

TITULOS = {
    "CORRETIVA": {
        "BOMBA": ["Vazamento no selo mecânico", "Ruído anormal no rolamento", "Queda de vazão de descarga"],
        "COMPRESSOR": ["Alarme de alta vibração", "Temperatura elevada no mancal", "Falha na válvula de sucção"],
        "TURBOGERADOR": ["Trip por alta temperatura de exaustão", "Falha no sistema de lubrificação", "Oscilação de frequência"],
        "SEPARADOR": ["Falha no controle de nível", "Vazamento em flange", "Instrumento de pressão com leitura errática"],
        "TROCADOR": ["Perda de eficiência térmica", "Vazamento no casco", "Incrustação nos tubos"],
    },
    "PREVENTIVA": {
        "BOMBA": ["Troca de óleo e inspeção de acoplamento", "Inspeção de alinhamento a laser"],
        "COMPRESSOR": ["Inspeção boroscópica", "Troca de filtros de ar e óleo"],
        "TURBOGERADOR": ["Inspeção de 4.000 horas", "Lavagem do compressor axial"],
        "SEPARADOR": ["Inspeção interna (NR-13)", "Calibração de transmissores"],
        "TROCADOR": ["Limpeza química programada", "Teste hidrostático"],
    },
    "PREDITIVA": {
        "BOMBA": ["Análise de vibração indicou desbalanceamento"],
        "COMPRESSOR": ["Análise de vibração indicou desgaste de mancal"],
        "TURBOGERADOR": ["Termografia indicou ponto quente"],
        "SEPARADOR": ["Ultrassom indicou perda de espessura"],
        "TROCADOR": ["Tendência de aumento de ΔT"],
    },
}
TIPO_PT = {"BOMBA": "GERAL", "COMPRESSOR": "TRABALHO_A_QUENTE", "TURBOGERADOR": "ELETRICA",
           "SEPARADOR": "ESPACO_CONFINADO", "TROCADOR": "ALTURA"}
RISCOS_PT = ["Gás inflamável", "Pressão residual", "Energia elétrica", "Trabalho em altura",
             "Espaço confinado", "Produtos químicos", "Superfície quente"]
PESO_RISCO = {"CRITICO": 6, "ALTO": 4, "MEDIO": 2, "BAIXO": 1}
COMENTARIO = "simulador de operação"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Contexto: pessoas e equipamentos
# MAGIC O cadastro de equipamentos e o risco vêm das **synced tables** (Lakehouse → Lakebase) — o simulador lê o mesmo que o app.

# COMMAND ----------

def carregar_contexto(conn):
    tecnicos, supervisores = {}, {}
    for uid, papel, unidade in conn.run("SELECT id, papel, unidade FROM operacao.usuarios WHERE ativo"):
        if papel == "TECNICO":
            tecnicos.setdefault(unidade, []).append(uid)
        elif papel == "SUPERVISOR":
            supervisores[unidade] = uid
    equipamentos = conn.run("""
        SELECT e.tag, e.nome, e.tipo, e.unidade, coalesce(s.risco, 'BAIXO')
        FROM analitico.equipamentos e LEFT JOIN analitico.saude_equipamentos s USING (tag)""")
    return tecnicos, supervisores, equipamentos


conn = conectar_lakebase(application_name="simulador-operacao")
TECNICOS, SUPERVISORES, EQUIPAMENTOS = carregar_contexto(conn)
print(f"👷 {sum(len(v) for v in TECNICOS.values())} técnicos · 🧑‍💼 {len(SUPERVISORES)} supervisores · ⚙️ {len(EQUIPAMENTOS)} equipamentos")
print("   riscos:", {r: sum(1 for e in EQUIPAMENTOS if e[4] == r) for r in PESO_RISCO})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Operações (cada uma é **um único comando SQL atômico** com CTEs — sem janela para inconsistência)

# COMMAND ----------

def criar_os(conn):
    tag, nome, tipo_eq, unidade, risco = random.choices(EQUIPAMENTOS, weights=[PESO_RISCO.get(e[4], 1) for e in EQUIPAMENTOS])[0]
    if risco in ("ALTO", "CRITICO"):
        tipo = random.choices(["CORRETIVA", "PREDITIVA", "PREVENTIVA"], [60, 30, 10])[0]
    else:
        tipo = random.choices(["CORRETIVA", "PREVENTIVA", "PREDITIVA"], [40, 50, 10])[0]
    prioridade = ({"CRITICO": "P1", "ALTO": "P2"}.get(risco) if tipo != "PREVENTIVA" else None) \
        or random.choices(["P2", "P3", "P4"], [20, 50, 30])[0]
    conn.run("""
        WITH nova AS (
          INSERT INTO operacao.ordens_servico
            (equipamento_tag, unidade, tipo, prioridade, origem, titulo, descricao, solicitante_id, data_prevista)
          VALUES (:tag, :unidade, :tipo, :prioridade, :origem, :titulo, :descricao, :solicitante,
                  current_date + CAST(:dias AS integer))
          RETURNING id, solicitante_id)
        INSERT INTO operacao.historico_status (entidade, entidade_id, para_status, usuario_id, comentario)
        SELECT 'OS', id, 'ABERTA', solicitante_id, :comentario FROM nova""",
        tag=tag, unidade=unidade, tipo=tipo, prioridade=prioridade,
        origem="PREDITIVA_LAKEHOUSE" if tipo == "PREDITIVA" else "MANUAL",
        titulo=f"{random.choice(TITULOS[tipo][tipo_eq])} — {nome}",
        descricao=f"Aberta em campo no {unidade} (simulador de operação).",
        solicitante=random.choice(TECNICOS[unidade]), dias=random.randint(2, 15), comentario=COMENTARIO)


def avancar(conn):
    """Move UMA OS um passo adiante no fluxo (as mais antigas primeiro)."""
    candidatas = conn.run("""
        SELECT o.id, o.status, o.unidade, o.tipo, o.equipamento_tag, pt.id, pt.status
        FROM operacao.ordens_servico o
        LEFT JOIN LATERAL (SELECT id, status FROM operacao.permissoes_trabalho p
                           WHERE p.ordem_id = o.id AND p.status IN ('SOLICITADA', 'APROVADA', 'EM_EXECUCAO')
                           ORDER BY id DESC LIMIT 1) pt ON true
        WHERE o.status NOT IN ('CONCLUIDA', 'CANCELADA') AND o.atualizado_em < now() - interval '20 seconds'
        ORDER BY o.atualizado_em LIMIT 10""")
    if not candidatas:
        return None
    os_id, status, unidade, tipo, tag, pt_id, pt_status = random.choice(candidatas)
    tipo_eq = next((e[2] for e in EQUIPAMENTOS if e[0] == tag), "BOMBA")

    if status == "ABERTA":
        para = "CANCELADA" if random.random() < 0.03 else "PLANEJADA"
        conn.run("""
            WITH u AS (UPDATE operacao.ordens_servico
                       SET status = :para, responsavel_id = coalesce(responsavel_id, :resp), version = version + 1, atualizado_em = now()
                       WHERE id = :id AND status = 'ABERTA' RETURNING id, solicitante_id)
            INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
            SELECT 'OS', id, 'ABERTA', :para, solicitante_id, :comentario FROM u""",
            para=para, resp=random.choice(TECNICOS[unidade]), id=os_id, comentario=COMENTARIO)
        return f"OS→{para}"

    if status == "PLANEJADA":
        conn.run("""
            WITH u AS (UPDATE operacao.ordens_servico SET status = 'AGUARDANDO_PT', version = version + 1, atualizado_em = now()
                       WHERE id = :id AND status = 'PLANEJADA' RETURNING id, solicitante_id),
                 pt AS (INSERT INTO operacao.permissoes_trabalho (ordem_id, tipo, riscos, medidas_controle, validade_horas, solicitante_id)
                        SELECT id, :tipo_pt, CAST(:riscos AS jsonb),
                               'Isolamento de energia, teste de atmosfera e liberação pela sala de controle.', 8, solicitante_id
                        FROM u RETURNING id, solicitante_id),
                 h AS (INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
                       SELECT 'OS', id, 'PLANEJADA', 'AGUARDANDO_PT', solicitante_id, :comentario FROM u)
            INSERT INTO operacao.historico_status (entidade, entidade_id, para_status, usuario_id, comentario)
            SELECT 'PT', id, 'SOLICITADA', solicitante_id, :comentario FROM pt""",
            id=os_id, tipo_pt=TIPO_PT.get(tipo_eq, "GERAL"), riscos=json.dumps(random.sample(RISCOS_PT, 2), ensure_ascii=False),
            comentario=COMENTARIO)
        return "PT solicitada"

    if status == "AGUARDANDO_PT" and pt_status == "SOLICITADA":
        aprovador = SUPERVISORES.get(unidade)
        conn.run("""
            WITH u AS (UPDATE operacao.permissoes_trabalho
                       SET status = 'APROVADA', aprovador_id = :aprovador, decidida_em = now(), comentario_decisao = 'Riscos controlados',
                           validade_inicio = now(), validade_fim = now() + make_interval(hours => validade_horas),
                           version = version + 1, atualizado_em = now()
                       WHERE id = :pt AND status = 'SOLICITADA' RETURNING id)
            INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
            SELECT 'PT', id, 'SOLICITADA', 'APROVADA', :aprovador, :comentario FROM u""",
            aprovador=aprovador, pt=pt_id, comentario=COMENTARIO)
        conn.run("UPDATE operacao.ordens_servico SET atualizado_em = now() WHERE id = :id", id=os_id)
        return "PT aprovada"

    if status == "AGUARDANDO_PT" and pt_status == "APROVADA":
        conn.run("""
            WITH p AS (UPDATE operacao.permissoes_trabalho SET status = 'EM_EXECUCAO', version = version + 1, atualizado_em = now()
                       WHERE id = :pt AND status = 'APROVADA' RETURNING id, ordem_id, solicitante_id),
                 o AS (UPDATE operacao.ordens_servico SET status = 'EM_EXECUCAO', data_inicio = now(), version = version + 1, atualizado_em = now()
                       WHERE id IN (SELECT ordem_id FROM p) AND status = 'AGUARDANDO_PT' RETURNING id, solicitante_id),
                 h AS (INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
                       SELECT 'PT', id, 'APROVADA', 'EM_EXECUCAO', solicitante_id, :comentario FROM p)
            INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
            SELECT 'OS', id, 'AGUARDANDO_PT', 'EM_EXECUCAO', solicitante_id, :comentario FROM o""",
            pt=pt_id, comentario=COMENTARIO)
        return "OS→EM_EXECUCAO"

    if status == "EM_EXECUCAO" and pt_status == "EM_EXECUCAO":
        # simulação acelerada: as horas de indisponibilidade representam o reparo real (base do MTTR no gold)
        horas = round(random.uniform(2, 24) if tipo == "CORRETIVA" else random.uniform(1, 8), 2)
        conn.run("""
            WITH p AS (UPDATE operacao.permissoes_trabalho SET status = 'ENCERRADA', version = version + 1, atualizado_em = now()
                       WHERE id = :pt AND status = 'EM_EXECUCAO' RETURNING id, ordem_id, solicitante_id),
                 o AS (UPDATE operacao.ordens_servico
                       SET status = 'CONCLUIDA', data_conclusao = now(), horas_indisponivel = :horas, version = version + 1, atualizado_em = now()
                       WHERE id IN (SELECT ordem_id FROM p) AND status = 'EM_EXECUCAO' RETURNING id, solicitante_id),
                 h AS (INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
                       SELECT 'PT', id, 'EM_EXECUCAO', 'ENCERRADA', solicitante_id, :comentario FROM p)
            INSERT INTO operacao.historico_status (entidade, entidade_id, de_status, para_status, usuario_id, comentario)
            SELECT 'OS', id, 'EM_EXECUCAO', 'CONCLUIDA', solicitante_id, :comentario FROM o""",
            pt=pt_id, horas=horas, comentario=COMENTARIO)
        return "OS→CONCLUIDA"

    # OS movida pelo app para um estado sem PT correspondente: só "encosta" no fim da fila
    conn.run("UPDATE operacao.ordens_servico SET atualizado_em = now() WHERE id = :id", id=os_id)
    return None

# COMMAND ----------

# MAGIC %md
# MAGIC ## ▶️ Loop de simulação

# COMMAND ----------

inicio = time.time()
fim = inicio + DURACAO_MIN * 60 if DURACAO_MIN > 0 else float("inf")
intervalo_os, intervalo_avanco = 60 / OS_POR_MINUTO, 60 / AVANCOS_POR_MINUTO
proxima_os = proximo_avanco = inicio
proximo_relatorio, proxima_reconexao = inicio + 60, inicio + 20 * 60   # token OAuth vale 1 h: reconectamos a cada 20 min
criadas = avancos = erros = 0
eventos = {}

print(f"▶️ simulação: {OS_POR_MINUTO:g} OS/min · {AVANCOS_POR_MINUTO:g} avanços/min · "
      f"{'sem fim' if DURACAO_MIN <= 0 else f'{DURACAO_MIN:g} min'}")
while time.time() < fim:
    agora = time.time()
    try:
        if agora >= proxima_reconexao:
            conn.close()
            conn = conectar_lakebase(application_name="simulador-operacao")
            TECNICOS, SUPERVISORES, EQUIPAMENTOS = carregar_contexto(conn)   # riscos atualizados pelo Passo 8b
            proxima_reconexao = agora + 20 * 60
        if agora >= proxima_os:
            criar_os(conn)
            criadas += 1
            proxima_os += intervalo_os
        if agora >= proximo_avanco:
            evento = avancar(conn)
            if evento:
                avancos += 1
                eventos[evento] = eventos.get(evento, 0) + 1
            proximo_avanco += intervalo_avanco
        if agora >= proximo_relatorio:
            backlog, em_exec = conn.run("""SELECT count(*) FILTER (WHERE status NOT IN ('CONCLUIDA', 'CANCELADA')),
                                                  count(*) FILTER (WHERE status = 'EM_EXECUCAO') FROM operacao.ordens_servico""")[0]
            print(f"{time.strftime('%H:%M:%S')}  +{criadas} OS · {avancos} avanços {eventos} · backlog {backlog} · em execução {em_exec}")
            proximo_relatorio += 60
    except Exception as e:  # noqa: BLE001 — conexão caiu, conflito com um usuário do app etc.: registra e segue
        erros += 1
        print(f"   ⚠️ {type(e).__name__}: {str(e)[:160]}")
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2)
        conn = conectar_lakebase(application_name="simulador-operacao")
    time.sleep(max(0.05, min(proxima_os, proximo_avanco, proximo_relatorio) - time.time()))

conn.close()
print(f"⏹️ fim: {criadas} OS criadas · {avancos} avanços · {erros} erros em {(time.time() - inicio) / 60:.1f} min")
