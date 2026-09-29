# Databricks notebook source
# MAGIC %md
# MAGIC # ⚙️ 00 · Configuração do workshop
# MAGIC
# MAGIC Este notebook centraliza **todos os nomes** usados nos labs. Os demais notebooks fazem `%run ../00_Setup/00_configuracao`.
# MAGIC
# MAGIC | Parâmetro | Padrão | Observação |
# MAGIC |---|---|---|
# MAGIC | `catalogo` | `gabriel_dev` | 👉 **ALTERE** para um catálogo UC onde você tenha `CREATE SCHEMA` |
# MAGIC | `schema` | `lakebase_workshop` | schema Delta (Lakehouse) do workshop |
# MAGIC | `projeto_lakebase` | `energia-workshop` | projeto Lakebase Autoscaling |
# MAGIC | `database` | `energia` | database Postgres dentro do projeto |
# MAGIC | `catalogo_lakebase` | `energia_lakebase` | catálogo UC que "espelha" o database Postgres |
# MAGIC | `warehouse_id` | *(auto)* | SQL Warehouse **serverless** — detectado automaticamente se vazio |
# MAGIC | `sufixo_usuario` | `nao` | `sim` = acrescenta seu usuário aos nomes (várias pessoas no mesmo workspace) |
# MAGIC
# MAGIC > 💡 Rode este notebook sozinho uma vez para conferir os nomes que serão usados.

# COMMAND ----------

import re

dbutils.widgets.text("catalogo", "gabriel_dev", "👉 Catálogo UC (Delta)")
dbutils.widgets.text("schema", "lakebase_workshop", "Schema UC (Delta)")
dbutils.widgets.text("projeto_lakebase", "energia-workshop", "Projeto Lakebase")
dbutils.widgets.text("database", "energia", "Database Postgres")
dbutils.widgets.text("catalogo_lakebase", "energia_lakebase", "Catálogo UC do Lakebase")
dbutils.widgets.text("warehouse_id", "", "SQL Warehouse serverless (id)")
dbutils.widgets.dropdown("sufixo_usuario", "nao", ["nao", "sim"], "Sufixar nomes com o usuário?")

USUARIO = spark.sql("SELECT current_user()").first()[0]
_slug = re.sub(r"[^a-z0-9]+", "_", USUARIO.split("@")[0].lower()).strip("_")
_sufixar = dbutils.widgets.get("sufixo_usuario") == "sim"

CATALOGO = dbutils.widgets.get("catalogo").strip()
SCHEMA = dbutils.widgets.get("schema").strip() + (f"_{_slug}" if _sufixar else "")
PROJETO = dbutils.widgets.get("projeto_lakebase").strip() + (f"-{_slug.replace('_', '-')}" if _sufixar else "")
DATABASE = dbutils.widgets.get("database").strip()
CATALOGO_LAKEBASE = dbutils.widgets.get("catalogo_lakebase").strip() + (f"_{_slug}" if _sufixar else "")

# Lakebase: hierarquia projeto → branch → endpoint (compute)
BRANCH_PROD = f"projects/{PROJETO}/branches/production"
ENDPOINT_PROD = f"{BRANCH_PROD}/endpoints/primary"

# Schemas Postgres — OLTP e synced tables NUNCA no mesmo schema
SCHEMA_OLTP = "operacao"        # escrito pelo app
SCHEMA_ANALITICO = "analitico"  # synced tables (Lakehouse → Lakebase), somente leitura

# Tabelas Delta (Lakehouse)
T_EQUIPAMENTOS = f"{CATALOGO}.{SCHEMA}.equipamentos"
T_TELEMETRIA = f"{CATALOGO}.{SCHEMA}.telemetria_sensores"
T_GOLD_SAUDE = f"{CATALOGO}.{SCHEMA}.gold_saude_equipamentos"
T_GOLD_KPIS = f"{CATALOGO}.{SCHEMA}.gold_kpis_manutencao"
T_GOLD_TELEMETRIA_DIARIA = f"{CATALOGO}.{SCHEMA}.gold_telemetria_diaria"

# COMMAND ----------

from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

WAREHOUSE_ID = dbutils.widgets.get("warehouse_id").strip()
if not WAREHOUSE_ID:
    _serverless = [wh for wh in w.warehouses.list() if wh.enable_serverless_compute]
    WAREHOUSE_ID = _serverless[0].id if _serverless else ""

# COMMAND ----------

def conectar_lakebase(endpoint: str = ENDPOINT_PROD, database: str = DATABASE, application_name: str = "workshop-notebook"):
    """Abre uma conexão com o Lakebase usando o SEU usuário (OAuth) — qualquer driver Postgres serve.

    O token é gerado pelo SDK (vale 1h) e usado como senha — mesmo padrão do app.
    Nos notebooks usamos o pg8000 (driver 100% Python); o app usa psycopg 3.
    """
    import ssl
    import pg8000.native

    ep = w.postgres.get_endpoint(name=endpoint)
    cred = w.postgres.generate_database_credential(endpoint=endpoint)
    return pg8000.native.Connection(
        user=USUARIO,
        password=cred.token,
        host=ep.status.hosts.host,
        port=5432,
        database=database,
        ssl_context=ssl.create_default_context(),
        application_name=application_name,
    )


def executar_sql_lakebase(sql: str, endpoint: str = ENDPOINT_PROD, database: str = DATABASE, **params):
    """Executa UM comando SQL no Lakebase (autocommit) e devolve as linhas. Parâmetros no estilo :nome."""
    conn = conectar_lakebase(endpoint, database)
    try:
        return conn.run(sql, **params)
    finally:
        conn.close()


def executar_script_lakebase(comandos: list, endpoint: str = ENDPOINT_PROD, database: str = DATABASE):
    """Executa vários comandos SQL em sequência (autocommit), na mesma conexão."""
    conn = conectar_lakebase(endpoint, database)
    try:
        for comando in comandos:
            conn.run(comando)
    finally:
        conn.close()


def sql_warehouse(query: str):
    """Executa SQL no SQL Warehouse serverless (Statement Execution API) e devolve um pandas DataFrame.

    Consultas ao catálogo do Lakebase (leitura federada) rodam no SQL Warehouse serverless.
    """
    import time as _time
    import pandas as pd
    from databricks.sdk.service.sql import StatementState

    r = w.statement_execution.execute_statement(statement=query, warehouse_id=WAREHOUSE_ID, wait_timeout="50s")
    while r.status.state in (StatementState.PENDING, StatementState.RUNNING):
        _time.sleep(2)
        r = w.statement_execution.get_statement(r.statement_id)
    if r.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"{r.status.state}: {r.status.error.message if r.status.error else ''}")
    colunas = [c.name for c in r.manifest.schema.columns] if r.manifest and r.manifest.schema else []
    linhas = list(r.result.data_array or []) if r.result else []
    for chunk in range(1, r.manifest.total_chunk_count or 1):
        linhas += w.statement_execution.get_statement_result_chunk_n(r.statement_id, chunk).data_array or []
    return pd.DataFrame(linhas, columns=colunas)

# COMMAND ----------

print(f"""
👤 Usuário ............ {USUARIO}
🏠 Lakehouse (Delta) .. {CATALOGO}.{SCHEMA}
🐘 Projeto Lakebase ... {PROJETO}
   Branch produção .... {BRANCH_PROD}
   Endpoint ........... {ENDPOINT_PROD}
   Database ........... {DATABASE}  (schemas: {SCHEMA_OLTP} = OLTP, {SCHEMA_ANALITICO} = synced)
📚 Catálogo Lakebase .. {CATALOGO_LAKEBASE}
🏭 SQL Warehouse ...... {WAREHOUSE_ID or '⚠️ nenhum warehouse serverless encontrado'}
""")
