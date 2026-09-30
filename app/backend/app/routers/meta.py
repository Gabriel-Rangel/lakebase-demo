"""Saúde, metadados e a página "Conexão Lakebase" (prova de que o app roda fora do Databricks)."""
import os
import socket
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from .. import db
from ..config import settings

router = APIRouter(prefix="/api", tags=["meta"])


def _partes_endpoint() -> dict:
    try:
        endpoint = db.endpoint_lakebase()
    except Exception:  # sem permissão para listar projetos etc. — a página continua funcionando
        endpoint = None
    partes = (endpoint or "").split("/")
    mapa = dict(zip(partes[::2], partes[1::2])) if len(partes) >= 2 else {}
    return {"projeto": mapa.get("projects"), "branch": mapa.get("branches"), "endpoint": endpoint}


@router.get("/health")
def health():
    return {"status": "ok"}  # não toca no banco: não acorda o compute


@router.get("/health/db")
def health_db():
    inicio = time.perf_counter()
    db.consultar("SELECT 1")
    return {"status": "ok", "latencia_ms": round((time.perf_counter() - inicio) * 1000, 1)}


@router.get("/meta")
def meta():
    versao = db.schema_version()
    return {
        "empresa": "Brickhouse Energia",
        "schema_version": versao,
        "loto_habilitado": versao >= 3,
        "branch": _partes_endpoint()["branch"],
        "modo_auth": settings.lakebase_auth_mode,
        "ambiente": settings.app_ambiente,
    }


def _endpoint_info():
    endpoint = _partes_endpoint()["endpoint"]
    if not (endpoint and db.tem_credencial_databricks()):
        return None

    def _ler():
        st = db.workspace().postgres.get_endpoint(name=endpoint).status
        return {
            "estado": st.current_state.value if st.current_state else "DESCONHECIDO",
            "min_cu": st.autoscaling_limit_min_cu,
            "max_cu": st.autoscaling_limit_max_cu,
            "suspend_timeout": st.suspend_timeout_duration.ToJsonString() if st.suspend_timeout_duration else None,
            "ultimo_ativo": st.last_active_time.ToDatetime(tzinfo=timezone.utc).isoformat() if st.last_active_time else None,
        }

    try:
        return db.em_cache("endpoint_info", 10, _ler)
    except Exception:  # sem permissão de leitura no projeto, rede etc. — a página continua funcionando
        return None


@router.get("/conexao")
def conexao():
    inicio = time.perf_counter()
    base = db.consultar_um(
        "SELECT current_user AS usuario_pg, current_setting('server_version') AS versao_postgres"
    )
    latencia = round((time.perf_counter() - inicio) * 1000, 1)
    tabelas = db.consultar(
        """
        SELECT n.nspname AS schema, c.relname AS tabela, pg_get_userbyid(c.relowner) AS dono,
               greatest(coalesce(s.n_live_tup, 0), c.reltuples)::bigint AS linhas_estimadas
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
        WHERE c.relkind IN ('r', 'p', 'v', 'm') AND n.nspname IN ('operacao', %s)
        ORDER BY 1, 2
        """,
        (db.SCHEMA_ANALITICO,),
    )
    for t in tabelas:
        t["tipo"] = "OLTP" if t["schema"] == "operacao" else "SYNCED"
    synced = db.tabelas_analiticas()
    existentes = [v for v in synced.values() if v["existe"]]
    stats = db.pool().get_stats()
    token = None
    if settings.lakebase_auth_mode in ("oauth", "profile") and db.token_lakebase.expira_em:
        restante = (db.token_lakebase.expira_em - datetime.now(timezone.utc)).total_seconds() / 60
        token = {"expira_em": db.token_lakebase.expira_em.isoformat(), "minutos_restantes": round(restante, 1),
                 "renovacoes": db.token_lakebase.renovacoes}
    return {
        "rodando_em": "docker" if os.path.exists("/.dockerenv") else "host",
        "hostname": socket.gethostname(),
        "modo_auth": settings.lakebase_auth_mode,
        "usuario_pg": base["usuario_pg"],
        "host": db.info_conexao.get("host"),
        "porta": db.info_conexao.get("porta"),
        "database": db.info_conexao.get("database"),
        **_partes_endpoint(),
        "versao_postgres": base["versao_postgres"],
        "schema_version": db.schema_version(),
        "latencia_ms": latencia,
        "token": token,
        "pool": {
            "tamanho": stats.get("pool_size", 0),
            "disponiveis": stats.get("pool_available", 0),
            "em_espera": stats.get("requests_waiting", 0),
            "max": stats.get("pool_max", settings.db_pool_max),
            "min": stats.get("pool_min", settings.db_pool_min),
            "conexoes_criadas": stats.get("connections_num", 0),
            "erros": stats.get("connections_errors", 0),
        },
        "endpoint_info": _endpoint_info(),
        "tabelas": tabelas,
        "privilegios_analitico_ok": all(v["disponivel"] for v in existentes),
    }
