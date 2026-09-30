"""Painel: KPIs ao vivo do OLTP (Lakebase) lado a lado com os KPIs do Lakehouse (synced table)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from .. import db
from ..services import equipamentos as equipamentos_srv

router = APIRouter(prefix="/api/painel", tags=["painel"])


@router.get("/kpis")
def kpis():
    oltp = db.consultar_um(
        """
        SELECT
          (SELECT count(*) FROM operacao.ordens_servico WHERE status NOT IN ('CONCLUIDA','CANCELADA')) AS os_abertas,
          (SELECT count(*) FROM operacao.ordens_servico WHERE status = 'EM_EXECUCAO') AS os_em_execucao,
          (SELECT count(*) FROM operacao.ordens_servico WHERE prioridade = 'P1' AND status NOT IN ('CONCLUIDA','CANCELADA')) AS os_p1_abertas,
          (SELECT count(*) FROM operacao.permissoes_trabalho WHERE status = 'SOLICITADA') AS pts_aguardando_aprovacao,
          (SELECT count(*) FROM operacao.permissoes_trabalho WHERE status IN ('APROVADA','EM_EXECUCAO')) AS pts_ativas,
          (SELECT count(*) FROM operacao.ordens_servico WHERE status = 'CONCLUIDA' AND data_conclusao > now() - interval '7 days') AS os_concluidas_7d
        """
    )
    oltp["consultado_em"] = datetime.now(timezone.utc)

    lakehouse = None
    if db.analitico_disponivel("kpis_manutencao"):
        por_unidade = db.consultar(
            f"""
            SELECT DISTINCT ON (unidade) unidade, data_referencia, disponibilidade_pct, mttr_horas, backlog_os,
                   equipamentos_risco_alto, health_score_medio, atualizado_em
            FROM {db.synced('kpis_manutencao')} ORDER BY unidade, data_referencia DESC
            """
        )
        lakehouse = {
            "fonte": "LAKEHOUSE_SYNCED",
            "atualizado_em": max((p["atualizado_em"] for p in por_unidade if p["atualizado_em"]), default=None),
            "por_unidade": por_unidade,
        }

    _, _, equipamentos = equipamentos_srv.listar()
    risco = [
        {k: e[k] for k in ("tag", "nome", "unidade", "health_score", "risco", "principal_sinal")}
        for e in equipamentos if e["health_score"] is not None
    ][:5]
    return {"oltp": oltp, "lakehouse": lakehouse, "equipamentos_risco": risco}


@router.get("/series")
def series(dias: int = Query(30, ge=7, le=365)):
    os_por_dia = db.consultar(
        """
        WITH dias AS (
          SELECT generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - (%(dias)s - 1),
                                 (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day')::date AS data
        ),
        abertas AS (
          SELECT (data_abertura AT TIME ZONE 'America/Sao_Paulo')::date AS data, count(*) AS n
          FROM operacao.ordens_servico WHERE data_abertura >= now() - make_interval(days => %(dias)s + 1) GROUP BY 1
        ),
        concluidas AS (
          SELECT (data_conclusao AT TIME ZONE 'America/Sao_Paulo')::date AS data, count(*) AS n
          FROM operacao.ordens_servico WHERE data_conclusao >= now() - make_interval(days => %(dias)s + 1) GROUP BY 1
        )
        SELECT d.data, coalesce(a.n, 0) AS abertas, coalesce(c.n, 0) AS concluidas
        FROM dias d LEFT JOIN abertas a USING (data) LEFT JOIN concluidas c USING (data)
        ORDER BY d.data
        """,
        {"dias": dias},
    )
    os_por_status = db.consultar(
        "SELECT status, count(*) AS total FROM operacao.ordens_servico "
        "WHERE status NOT IN ('CONCLUIDA','CANCELADA') OR data_abertura > now() - make_interval(days => %s) "
        "GROUP BY 1 ORDER BY array_position(ARRAY['ABERTA','PLANEJADA','AGUARDANDO_PT','EM_EXECUCAO','CONCLUIDA','CANCELADA'], status)",
        (dias,),
    )
    os_por_unidade = db.consultar(
        """
        SELECT unidade,
               count(*) FILTER (WHERE status NOT IN ('CONCLUIDA','CANCELADA')) AS abertas,
               count(*) FILTER (WHERE status NOT IN ('CONCLUIDA','CANCELADA') AND prioridade IN ('P1','P2')) AS criticas
        FROM operacao.ordens_servico GROUP BY 1 ORDER BY 1
        """
    )
    return {"os_por_dia": os_por_dia, "os_por_status": os_por_status, "os_por_unidade": os_por_unidade}
