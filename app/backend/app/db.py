"""Conexão com o Lakebase (Postgres) — pool psycopg 3 com três modos de autenticação.

oauth    Service Principal (OAuth M2M): o SDK do Databricks lê DATABRICKS_HOST / CLIENT_ID / CLIENT_SECRET,
         gera um token do Lakebase (válido por 1h) e ele é usado como SENHA do Postgres.
password Role nativa do Postgres (PGUSER / PGPASSWORD) — igual a qualquer Postgres.
profile  Seu usuário via perfil do Databricks CLI (DATABRICKS_CONFIG_PROFILE) — só fora do Docker.

O token OAuth só é validado no login: conexões abertas continuam vivas depois que ele expira.
Por isso o pool recicla conexões a cada 45 min (max_lifetime) e cada conexão NOVA pega um token válido.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Optional

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import settings

log = logging.getLogger("energia.db")


class LakebaseIndisponivel(Exception):
    """Lakebase não respondeu (compute acordando do scale-to-zero, rede, credencial)."""


# ---------------------------------------------------------------------------
# Databricks SDK (somente modos oauth/profile, ou para ler metadados do endpoint)
# ---------------------------------------------------------------------------
_workspace = None
_workspace_lock = threading.Lock()


def tem_credencial_databricks() -> bool:
    if settings.lakebase_auth_mode in ("oauth", "profile"):
        return True
    return bool(os.getenv("DATABRICKS_HOST") and os.getenv("DATABRICKS_CLIENT_ID"))


def workspace():
    global _workspace
    with _workspace_lock:
        if _workspace is None:
            from databricks.sdk import WorkspaceClient

            if settings.lakebase_auth_mode == "profile":
                _workspace = WorkspaceClient(profile=os.getenv("DATABRICKS_CONFIG_PROFILE"))
            else:
                _workspace = WorkspaceClient()
        return _workspace


_endpoint_resolvido: Optional[str] = None


def endpoint_lakebase() -> Optional[str]:
    """Caminho do endpoint (projects/<id>/branches/<id>/endpoints/<id>).

    Usa LAKEBASE_ENDPOINT se definido; senão descobre pelo PGHOST (o host copiado do diálogo Connect)
    varrendo os projetos que a identidade enxerga — o resultado fica em cache.
    """
    global _endpoint_resolvido
    if settings.lakebase_endpoint:
        return settings.lakebase_endpoint
    if _endpoint_resolvido or not (settings.pghost and tem_credencial_databricks()):
        return _endpoint_resolvido
    pg = workspace().postgres
    for projeto in pg.list_projects():
        for branch in pg.list_branches(parent=projeto.name):
            for ep in pg.list_endpoints(parent=branch.name):
                hosts = ep.status.hosts if ep.status else None
                if hosts and settings.pghost in (hosts.host, hosts.read_write_pooled_host):
                    _endpoint_resolvido = ep.name
                    log.info("🔎 endpoint descoberto pelo PGHOST: %s", ep.name)
                    return ep.name
    raise RuntimeError(f"Nenhum endpoint Lakebase visível com host {settings.pghost} — confira PGHOST, "
                       "o CAN_USE do Service Principal no projeto ou defina LAKEBASE_ENDPOINT")


class _TokenLakebase:
    """Cache do token OAuth do Lakebase — renova quando faltam menos de 5 minutos."""

    MARGEM = timedelta(minutes=5)

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.token: Optional[str] = None
        self.expira_em: Optional[datetime] = None
        self.renovacoes = 0

    def obter(self) -> str:
        with self._lock:
            agora = datetime.now(timezone.utc)
            if self.token is None or self.expira_em is None or self.expira_em - agora < self.MARGEM:
                cred = workspace().postgres.generate_database_credential(endpoint=endpoint_lakebase())
                self.token = cred.token
                self.expira_em = (
                    cred.expire_time.ToDatetime(tzinfo=timezone.utc) if cred.expire_time else agora + timedelta(hours=1)
                )
                self.renovacoes += 1
                log.info("🔑 token do Lakebase renovado (expira %s)", self.expira_em.isoformat())
            return self.token


token_lakebase = _TokenLakebase()


def _usuario_postgres() -> str:
    # Nos modos OAuth a role Postgres é a própria identidade Databricks — PGUSER vale só para o modo password
    if settings.lakebase_auth_mode == "oauth":
        return workspace().config.client_id  # role do SP = client id (application id)
    if settings.lakebase_auth_mode == "profile":
        return workspace().current_user.me().user_name
    if not settings.pguser:
        raise RuntimeError("Defina PGUSER para o modo password")
    return settings.pguser


def _host_postgres() -> str:
    if settings.pghost:
        return settings.pghost
    if settings.lakebase_endpoint and tem_credencial_databricks():
        return workspace().postgres.get_endpoint(name=settings.lakebase_endpoint).status.hosts.host
    raise RuntimeError("Defina PGHOST (host do diálogo Connect do Lakebase)")


class LakebaseConnection(psycopg.Connection):
    """Cada conexão nova recebe um token OAuth válido como senha (modos oauth/profile)."""

    @classmethod
    def connect(cls, conninfo: str = "", **kwargs: Any):  # type: ignore[override]
        if settings.lakebase_auth_mode in ("oauth", "profile"):
            kwargs["password"] = token_lakebase.obter()
        return super().connect(conninfo, **kwargs)


def usa_pooler(host: str) -> bool:
    return "-pooler" in host


def montar_conninfo(application_name: str = "brickhouse-energia-app") -> tuple[str, dict]:
    host = _host_postgres()
    parametros = dict(
        host=host,
        port=settings.pgport,
        dbname=settings.pgdatabase,
        user=_usuario_postgres(),
        sslmode=settings.pgsslmode,
        connect_timeout=10,
        application_name=application_name,
        keepalives=1,
        keepalives_idle=30,
    )
    kwargs: dict = {"row_factory": dict_row}
    if settings.lakebase_auth_mode == "password" and settings.pgpassword:
        parametros["password"] = settings.pgpassword
    if usa_pooler(host):
        kwargs["prepare_threshold"] = None  # PgBouncer (transaction mode) não suporta prepared statements
    else:
        parametros["options"] = f"-c statement_timeout={settings.db_statement_timeout_ms}"
    return make_conninfo(**parametros), kwargs


# ---------------------------------------------------------------------------
# Pool
# ---------------------------------------------------------------------------
_pool: Optional[ConnectionPool] = None
info_conexao: dict = {}


def abrir_pool() -> ConnectionPool:
    global _pool
    conninfo, kwargs = montar_conninfo()
    params = psycopg.conninfo.conninfo_to_dict(conninfo)
    info_conexao.update(host=params["host"], porta=int(params["port"]), database=params["dbname"], usuario=params["user"])
    # autocommit: leituras custam 1 round-trip (sem BEGIN/COMMIT); escritas usam conn.transaction().
    # Sem "check" a cada empréstimo (seria +1 round-trip); conexões mortas → retry nas leituras.
    _pool = ConnectionPool(
        conninfo=conninfo,
        kwargs={**kwargs, "autocommit": True},
        connection_class=LakebaseConnection,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        max_lifetime=settings.db_pool_max_lifetime,
        max_idle=settings.db_pool_max_idle,
        timeout=30,
        name="lakebase",
        open=False,
    )
    _pool.open(wait=False)
    log.info("🐘 pool aberto: %s@%s/%s (modo %s)", info_conexao["usuario"], info_conexao["host"],
             info_conexao["database"], settings.lakebase_auth_mode)
    return _pool


def fechar_pool() -> None:
    if _pool is not None:
        _pool.close()


def pool() -> ConnectionPool:
    if _pool is None:
        raise LakebaseIndisponivel("pool não inicializado")
    return _pool


@contextmanager
def _emprestar() -> Iterator[psycopg.Connection]:
    from psycopg_pool import PoolTimeout

    try:
        with pool().connection() as conn:
            yield conn
    except (psycopg.OperationalError, PoolTimeout) as e:
        raise LakebaseIndisponivel(str(e)) from e


@contextmanager
def leitura() -> Iterator[psycopg.Connection]:
    """Conexão do pool em autocommit — para várias leituras seguidas sem BEGIN/COMMIT."""
    with _emprestar() as conn:
        yield conn


@contextmanager
def conexao() -> Iterator[psycopg.Connection]:
    """Conexão do pool dentro de uma transação: commit ao sair, rollback em caso de erro."""
    with _emprestar() as conn, conn.transaction():
        yield conn


def _com_retry(fn):
    """Uma nova tentativa para leituras — cobre conexão morta (compute reiniciou / acordou do scale-to-zero)."""
    try:
        return fn()
    except LakebaseIndisponivel:
        time.sleep(0.5)
        return fn()


def consultar(sql: Any, params: Any = None) -> list[dict]:
    """Leitura em autocommit (1 round-trip)."""

    def _executar():
        with _emprestar() as conn:
            return conn.execute(sql, params).fetchall()

    return _com_retry(_executar)


def consultar_um(sql: Any, params: Any = None) -> Optional[dict]:
    linhas = consultar(sql, params)
    return linhas[0] if linhas else None


# ---------------------------------------------------------------------------
# Metadados com cache curto (evita consultar o catálogo a cada request)
# ---------------------------------------------------------------------------
_cache: dict[str, tuple[float, Any]] = {}


def em_cache(chave: str, ttl: float, fn):
    agora = time.monotonic()
    if chave in _cache and agora - _cache[chave][0] < ttl:
        return _cache[chave][1]
    valor = fn()
    _cache[chave] = (agora, valor)
    return valor


def limpar_cache() -> None:
    _cache.clear()


def schema_version() -> int:
    def _ler():
        linha = consultar_um(
            "SELECT CASE WHEN to_regclass('operacao.schema_migrations') IS NULL THEN 0 "
            "ELSE (SELECT coalesce(max(versao), 0) FROM operacao.schema_migrations) END AS v"
        )
        return int(linha["v"]) if linha else 0

    return em_cache("schema_version", 15, _ler)


TABELAS_SYNCED = ("cadastro_equipamentos", "saude_equipamentos", "kpis_manutencao", "telemetria_diaria")

if not re.fullmatch(r"[a-z_][a-z0-9_]*", settings.pg_schema_analitico):
    raise ValueError(f"PG_SCHEMA_ANALITICO inválido: {settings.pg_schema_analitico!r}")
SCHEMA_ANALITICO = settings.pg_schema_analitico


def synced(nome: str) -> str:
    """Nome qualificado de uma synced table no Postgres (schema validado acima)."""
    return f'"{SCHEMA_ANALITICO}".{nome}'


def tabelas_analiticas() -> dict[str, dict[str, bool]]:
    """Synced tables (schema PG_SCHEMA_ANALITICO): existem? o app tem SELECT nelas?

    Usa o catálogo (pg_class) — funciona mesmo sem USAGE no schema, antes do GRANT do Passo 5.
    """

    def _ler():
        linhas = consultar(
            """
            SELECT t.nome,
                   c.oid IS NOT NULL AS existe,
                   COALESCE(c.oid IS NOT NULL AND has_schema_privilege(n.oid, 'USAGE')
                            AND has_table_privilege(c.oid, 'SELECT'), false) AS disponivel
            FROM unnest(%s::text[]) AS t(nome)
            LEFT JOIN pg_namespace n ON n.nspname = %s
            LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.nome
            """,
            (list(TABELAS_SYNCED), SCHEMA_ANALITICO),
        )
        return {l["nome"]: {"existe": bool(l["existe"]), "disponivel": bool(l["disponivel"])} for l in linhas}

    return em_cache("tabelas_analiticas", 15, _ler)


def analitico_disponivel(nome: str) -> bool:
    return tabelas_analiticas().get(nome, {}).get("disponivel", False)
