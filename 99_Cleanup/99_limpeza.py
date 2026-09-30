# Databricks notebook source
# MAGIC %md
# MAGIC # 🧹 99 · Limpeza
# MAGIC
# MAGIC Remove tudo o que o workshop criou, **na ordem certa** (dependências primeiro):
# MAGIC
# MAGIC 1. synced tables (e seus pipelines) → 2. catálogo `energia_lakebase` → 3. branches → 4. projeto Lakebase
# MAGIC → 5. schema Delta → 6. Service Principal do app (opcional)
# MAGIC
# MAGIC > ⚠️ **Irreversível.** Mude o widget `confirmar` para `sim` para executar.
# MAGIC > Local: `./99_Cleanup/limpar_local.sh` derruba os containers. Jobs do bundle: `databricks bundle destroy`.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120"

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.dropdown("confirmar", "nao", ["nao", "sim"], "⚠️ Confirmar limpeza?")
dbutils.widgets.dropdown("apagar_service_principal", "nao", ["nao", "sim"], "Apagar o SP energia-app-sp?")
CONFIRMAR = dbutils.widgets.get("confirmar") == "sim"
print(f"Projeto {PROJETO} · catálogo {CATALOGO_LAKEBASE} · schema {CATALOGO}.{SCHEMA}")
if not CONFIRMAR:
    dbutils.notebook.exit("confirmar = nao — nada foi apagado")

# COMMAND ----------

from databricks.sdk.errors import NotFound

def tentar(descricao, fn):
    try:
        fn()
        print(f"✅ {descricao}")
    except NotFound:
        print(f"ℹ️ {descricao}: não existe")
    except Exception as e:  # noqa: BLE001
        print(f"⚠️ {descricao}: {str(e)[:200]}")

# 1. synced tables
for nome in SYNCED:
    tentar(f"synced table {nome}",
           lambda n=nome: w.postgres.delete_synced_table(name=f"synced_tables/{CATALOGO}.{SCHEMA}.{n}").wait())

# 2. catálogo do Lakebase no UC
tentar(f"catálogo {CATALOGO_LAKEBASE}", lambda: w.postgres.delete_catalog(name=f"catalogs/{CATALOGO_LAKEBASE}").wait())

# 3. branches (exceto o padrão)
try:
    for b in w.postgres.list_branches(parent=f"projects/{PROJETO}"):
        if b.status and not b.status.default:
            tentar(f"branch {b.name}", lambda n=b.name: w.postgres.delete_branch(name=n).wait())
except NotFound:
    pass

# 4. projeto (purge libera o nome imediatamente)
tentar(f"projeto {PROJETO}", lambda: w.postgres.delete_project(name=f"projects/{PROJETO}", purge=True).wait())

# 5. schema Delta (inclui as tabelas de staging dos pipelines de synced table)
tentar(f"schema {CATALOGO}.{SCHEMA}", lambda: spark.sql(f"DROP SCHEMA IF EXISTS {CATALOGO}.{SCHEMA} CASCADE"))

# 6. Service Principal
if dbutils.widgets.get("apagar_service_principal") == "sim":
    for sp in w.service_principals.list(filter="displayName eq 'energia-app-sp'"):
        tentar(f"service principal {sp.display_name}", lambda i=sp.id: w.service_principals.delete(id=i))
