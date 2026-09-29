"""Equipamentos = cadastro mestre + saúde calculada no Lakehouse (synced tables no schema `analitico`).

Antes do Passo 5 as synced tables não existem: usamos o CSV embutido na imagem (fonte = CSV_LOCAL).
"""
import csv
import functools
from typing import Optional

from .. import db
from ..config import settings

CAMPOS_SAUDE = ("health_score", "risco", "prob_falha_30d", "principal_sinal", "recomendacao", "atualizado_em")
FINAIS = ("CONCLUIDA", "CANCELADA")


@functools.lru_cache(maxsize=1)
def _csv() -> tuple[dict, ...]:
    with open(settings.dados_equipamentos_csv, encoding="utf-8") as f:
        linhas = list(csv.DictReader(f))
    for l in linhas:
        l["potencia_kw"] = int(l["potencia_kw"]) if l.get("potencia_kw") else None
    return tuple(linhas)


def _cadastro() -> tuple[list[dict], bool]:
    if db.analitico_disponivel("equipamentos"):
        linhas = db.consultar(
            "SELECT tag, nome, tipo, unidade, sistema, criticidade, fabricante, modelo, potencia_kw, data_instalacao "
            "FROM analitico.equipamentos"
        )
        return linhas, True
    return [dict(l) for l in _csv()], False


def _saude() -> dict[str, dict]:
    if not db.analitico_disponivel("saude_equipamentos"):
        return {}
    linhas = db.consultar(
        "SELECT tag, health_score, risco, prob_falha_30d, principal_sinal, recomendacao, atualizado_em "
        "FROM analitico.saude_equipamentos"
    )
    return {l["tag"]: l for l in linhas}


def listar() -> tuple[str, Optional[object], list[dict]]:
    cadastro, cadastro_synced = db.em_cache("cadastro_equipamentos", 30, _cadastro)
    saude = db.em_cache("saude_equipamentos", 5, _saude)
    abertas = {
        l["equipamento_tag"]: l["n"]
        for l in db.consultar(
            "SELECT equipamento_tag, count(*) AS n FROM operacao.ordens_servico "
            "WHERE status NOT IN ('CONCLUIDA', 'CANCELADA') GROUP BY 1"
        )
    }
    itens = []
    for e in cadastro:
        s = saude.get(e["tag"], {})
        itens.append({**e, **{c: s.get(c) for c in CAMPOS_SAUDE}, "os_abertas": abertas.get(e["tag"], 0)})
    itens.sort(key=lambda i: (i["health_score"] is None, i["health_score"] or 0, i["tag"]))
    fonte = "LAKEHOUSE_SYNCED" if (cadastro_synced or saude) else "CSV_LOCAL"
    atualizado_em = max((s["atualizado_em"] for s in saude.values() if s.get("atualizado_em")), default=None)
    return fonte, atualizado_em, itens


def mapa_nomes() -> dict[str, dict]:
    """tag -> {nome, unidade} (usado para enriquecer as OS e validar tags)."""
    cadastro, _ = db.em_cache("cadastro_equipamentos", 30, _cadastro)
    return {e["tag"]: e for e in cadastro}


def tendencia(tag: str) -> list[dict]:
    if not db.analitico_disponivel("telemetria_diaria"):
        return []
    return db.consultar(
        "SELECT data, vibracao_mm_s, temperatura_c, pressao_bar, corrente_a "
        "FROM analitico.telemetria_diaria WHERE tag = %s ORDER BY data",
        (tag,),
    )
