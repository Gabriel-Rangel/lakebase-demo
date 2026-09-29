# Databricks notebook source
# MAGIC %md
# MAGIC # 1️⃣ Passo 1 · Criar o projeto Lakebase (Postgres serverless)
# MAGIC
# MAGIC **Objetivo:** criar o banco transacional da *Brickhouse Energia* — sem servidor, sem VM, sem `docker run postgres`.
# MAGIC
# MAGIC ```
# MAGIC Projeto  energia-workshop            ← unidade de governança e custo (Postgres 17)
# MAGIC └─ Branch  production                ← "git para dados": branches são cópias zero-copy
# MAGIC    └─ Endpoint primary (read-write)  ← compute com autoscaling 0,5 → 4 CU e scale-to-zero
# MAGIC ```
# MAGIC
# MAGIC | Conceito | O que significa |
# MAGIC |---|---|
# MAGIC | **Separação compute/storage** | o storage é gerenciado (multi-AZ); o compute (endpoint) liga, cresce e desliga sozinho |
# MAGIC | **CU** (Compute Unit) | 1 CU ≈ 2 GiB de RAM; o endpoint escala entre o mínimo e o máximo conforme a carga |
# MAGIC | **Scale-to-zero** | sem conexões pelo tempo configurado, o compute suspende e para de cobrar |
# MAGIC
# MAGIC ## Opção A — pela UI (5 min)
# MAGIC 1. Menu lateral › **Compute** › **Lakebase Postgres** › **Create project**.
# MAGIC 2. **Name** = `energia-workshop` (👉 **ALTERE** se usar sufixo por participante) · **Postgres 17**.
# MAGIC 3. **Compute**: mínimo **0,5 CU**, máximo **4 CU**, **scale to zero** ligado.
# MAGIC 4. Habilite **Postgres native login** (roles com senha — usaremos no Passo 7).
# MAGIC 5. **Create** → o endpoint fica **Active** em menos de 1 minuto.
# MAGIC
# MAGIC ## Opção B — por código (este notebook)
# MAGIC O mesmo JSON serve para a **API REST**, o **SDK Python** e o **CLI** (`databricks postgres create-project`).

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1.1 Especificação do projeto
# MAGIC
# MAGIC > ⚠️ Sem `initial_endpoint_spec` o compute inicial nasce **grande** (8–16 CU). Para a demo limitamos a **0,5–4 CU**.

# COMMAND ----------

import json

projeto_spec = {
    "spec": {
        "display_name": "Brickhouse Energia — Workshop Lakebase",
        "pg_version": 17,
        "enable_pg_native_login": True,          # roles Postgres com senha (Passo 7 — "só troque a connection string")
        "history_retention_duration": "172800s", # 2 dias de histórico (restore / branch point-in-time)
        "default_endpoint_settings": {           # padrão para computes de NOVOS branches (Extras)
            "autoscaling_limit_min_cu": 0.5,
            "autoscaling_limit_max_cu": 2,
            "suspend_timeout_duration": "300s",
        },
        "custom_tags": [{"key": "workshop", "value": "lakebase-energia"}],  # aparecem no billing
    },
    "initial_endpoint_spec": {                   # compute do branch production
        "autoscaling_limit_min_cu": 0.5,
        "autoscaling_limit_max_cu": 4,
        "suspend_timeout_duration": "3600s",     # scale-to-zero após 1 h sem conexões
    },
}
print(json.dumps(projeto_spec, indent=2, ensure_ascii=False))

# COMMAND ----------

# MAGIC %md
# MAGIC Equivalente no CLI (terminal):
# MAGIC ```bash
# MAGIC databricks postgres create-project energia-workshop --json @projeto.json
# MAGIC ```

# COMMAND ----------

from databricks.sdk.errors import NotFound
from databricks.sdk.service.postgres import Project

try:
    projeto = w.postgres.get_project(name=f"projects/{PROJETO}")
    print(f"ℹ️ Projeto {PROJETO} já existe — seguindo.")
except NotFound:
    print(f"⏳ Criando projeto {PROJETO}…")
    projeto = w.postgres.create_project(project=Project.from_dict(projeto_spec), project_id=PROJETO).wait()
    print(f"✅ Projeto criado: {projeto.name}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1.2 Endpoint (compute) e host de conexão
# MAGIC O host é o que qualquer cliente Postgres usa — é ele que vai para o `.env` do app no Passo 7.

# COMMAND ----------

import time

for _ in range(60):
    ep = w.postgres.get_endpoint(name=ENDPOINT_PROD)
    estado = ep.status.current_state.value if ep.status.current_state else "?"
    if ep.status.hosts and ep.status.hosts.host and estado in ("ACTIVE", "IDLE"):
        break
    print(f"   endpoint em {estado}…"); time.sleep(5)

HOST = ep.status.hosts.host
print(f"""✅ Endpoint {ENDPOINT_PROD}
   estado ........ {estado}
   host .......... {HOST}
   host (pooler) . {ep.status.hosts.read_write_pooled_host}   ← PgBouncer, para muitas conexões curtas
   autoscaling ... {ep.status.autoscaling_limit_min_cu} → {ep.status.autoscaling_limit_max_cu} CU
   scale-to-zero . {ep.status.suspend_timeout_duration.ToJsonString() if ep.status.suspend_timeout_duration else '—'}""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1.3 Primeira conexão — é Postgres puro
# MAGIC Todo projeto nasce com o database `databricks_postgres`. A senha é um **token OAuth** do Databricks (vale 1 h),
# MAGIC gerado para o **seu** usuário — sem senha estática.

# COMMAND ----------

print(executar_sql_lakebase("SELECT current_user, current_database(), version()", database="databricks_postgres")[0])

# COMMAND ----------

# MAGIC %md
# MAGIC ### Do seu terminal (psql / DBeaver / pgAdmin)
# MAGIC ```bash
# MAGIC export PGPASSWORD=$(databricks postgres generate-database-credential \
# MAGIC     projects/energia-workshop/branches/production/endpoints/primary -o json | jq -r .token)
# MAGIC psql "host=<HOST> port=5432 dbname=databricks_postgres user=<seu-email> sslmode=require"
# MAGIC ```
# MAGIC ✅ **Checkpoint:** projeto `energia-workshop` com endpoint **ACTIVE**. Próximo: [**Passo 2 — database e tabelas**](../02_Criar_Database_e_Tabelas/02_criar_database_e_tabelas).
