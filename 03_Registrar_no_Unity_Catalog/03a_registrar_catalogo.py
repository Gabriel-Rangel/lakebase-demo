# Databricks notebook source
# MAGIC %md
# MAGIC # 3️⃣ Passo 3 · Registrar o Lakebase no Unity Catalog
# MAGIC
# MAGIC **O transacional passa a ser visível no Lakehouse — sem ETL, sem cópia.**
# MAGIC
# MAGIC Registrar o database `energia` no Unity Catalog cria o catálogo **`energia_lakebase`**:
# MAGIC
# MAGIC | | |
# MAGIC |---|---|
# MAGIC | 🔍 **Leitura federada** | consultas no SQL Warehouse leem o Postgres **ao vivo** (o dado não é copiado) |
# MAGIC | 🛡️ **Governança** | `GRANT SELECT` / `USE CATALOG` do Unity Catalog, linhagem e auditoria |
# MAGIC | 🧩 **Integração** | o OLTP vira insumo para SQL, dashboards, Genie e notebooks — junto com o Delta |
# MAGIC | 🔒 **Somente leitura** | escrita continua sendo feita pelo app, via Postgres |
# MAGIC
# MAGIC ## Opção A — pela UI
# MAGIC Compute › **Lakebase Postgres** › projeto `energia-workshop` › branch `production` › **Register in Unity Catalog**
# MAGIC › database `energia` › catálogo `energia_lakebase`.
# MAGIC
# MAGIC ## Opção B — por código (este notebook)

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

from databricks.sdk.errors import NotFound
from databricks.sdk.service.postgres import Catalog

catalogo_spec = {"spec": {"postgres_database": DATABASE, "branch": BRANCH_PROD}}
try:
    cat = w.postgres.get_catalog(name=f"catalogs/{CATALOGO_LAKEBASE}")
    print(f"ℹ️ Catálogo {CATALOGO_LAKEBASE} já registrado.")
except NotFound:
    print(f"⏳ Registrando {DATABASE} como catálogo {CATALOGO_LAKEBASE}…")
    cat = w.postgres.create_catalog(catalog=Catalog.from_dict(catalogo_spec), catalog_id=CATALOGO_LAKEBASE).wait()
    print(f"✅ Catálogo criado: {cat.name}")

# COMMAND ----------

# MAGIC %md
# MAGIC Equivalente no CLI:
# MAGIC ```bash
# MAGIC databricks postgres create-catalog energia_lakebase \
# MAGIC   --json '{"spec": {"postgres_database": "energia", "branch": "projects/energia-workshop/branches/production"}}'
# MAGIC ```
# MAGIC
# MAGIC ## O OLTP aparece no Catalog Explorer
# MAGIC Abra **Catalog** › `energia_lakebase` › `operacao`: tabelas, colunas e os **comentários** que o time de aplicação escreveu
# MAGIC na migração (`COMMENT ON TABLE ...`) aparecem para o time de dados.

# COMMAND ----------

display(sql_warehouse(f"SHOW TABLES IN {CATALOGO_LAKEBASE}.{SCHEMA_OLTP}"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Consulta federada ao vivo
# MAGIC As 300 OS criadas no Passo 2 já aparecem. Depois do Passo 7, crie uma OS no app e rode de novo: ela aparece **na hora**.

# COMMAND ----------

display(sql_warehouse(f"""
SELECT numero, equipamento_tag, unidade, tipo, prioridade, status, origem, titulo, data_abertura
FROM {CATALOGO_LAKEBASE}.{SCHEMA_OLTP}.ordens_servico
ORDER BY data_abertura DESC
LIMIT 10
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Governança: quem pode ler o transacional?
# MAGIC O acesso é controlado pelo Unity Catalog — o mesmo modelo de permissões do Lakehouse.
# MAGIC ```sql
# MAGIC GRANT USE CATALOG ON CATALOG energia_lakebase TO `analistas-manutencao`;
# MAGIC GRANT USE SCHEMA, SELECT ON SCHEMA energia_lakebase.operacao TO `analistas-manutencao`;
# MAGIC ```
# MAGIC
# MAGIC ✅ **Checkpoint:** catálogo `energia_lakebase` no Catalog Explorer. Próximo: [`03b_consultas_federadas`](./03b_consultas_federadas) — o transacional junto com a telemetria Delta.
