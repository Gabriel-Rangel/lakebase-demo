# Databricks notebook source
# MAGIC %md
# MAGIC # 😴 Extra 2 · Scale-to-zero no branch `dev`
# MAGIC
# MAGIC | Conceito | Como ver |
# MAGIC |---|---|
# MAGIC | **Autoscaling** — o compute cresce/diminui com a carga (aqui 0,5 → 2 CU no `dev`; 1 CU ≈ 2 GiB RAM) | UI › projeto › branch `dev` › **Monitoring** (CPU / RAM *allocated*) |
# MAGIC | **Scale-to-zero** — sem conexões por 60 s, o compute suspende e **para de cobrar** | estado do endpoint `ACTIVE → IDLE` (célula 3) |
# MAGIC | **Cold start** — a 1ª conexão acorda o compute em ~centenas de ms | página **Conexão Lakebase** do app de dev |
# MAGIC | **Observabilidade Postgres** — `pg_stat_activity`, `pg_stat_statements` | célula 2 |
# MAGIC
# MAGIC > Rodamos a carga no **branch `dev`** (Extra 1): produção nem percebe — isolamento de compute na prática.
# MAGIC
# MAGIC ## Passo 1 — Gerar carga (terminal, pasta `app/`)
# MAGIC ```bash
# MAGIC # (opcional) volume: +200 mil OS históricas no dev via COPY
# MAGIC APP_ENV_FILE=.env.dev docker compose -p energia-dev run --rm seed --volume grande
# MAGIC # 5 minutos de agregações pesadas + busca textual com 32 workers
# MAGIC APP_ENV_FILE=.env.dev docker compose -p energia-dev run --rm carga --workers 32 --duracao 300 --modo leitura
# MAGIC ```
# MAGIC Enquanto roda: abra **Monitoring** do branch `dev` e veja CPU/RAM alocados subindo em direção a 2 CU.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.text("branch_id", "dev", "Branch da carga")
ENDPOINT_DEV = f"projects/{PROJETO}/branches/{dbutils.widgets.get('branch_id')}/endpoints/primary"

def estado_endpoint(nome=ENDPOINT_DEV):
    st = w.postgres.get_endpoint(name=nome).status
    return {
        "estado": st.current_state.value if st.current_state else "?",
        "cu": f"{st.autoscaling_limit_min_cu}–{st.autoscaling_limit_max_cu}",
        "suspende_apos": st.suspend_timeout_duration.ToJsonString() if st.suspend_timeout_duration else None,
        "ultimo_ativo": st.last_active_time.ToDatetime().isoformat() if st.last_active_time else None,
    }

for nome, ep in (("production", ENDPOINT_PROD), ("dev", ENDPOINT_DEV)):
    print(f"{nome:10s}", estado_endpoint(ep))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 2 — O que o Postgres está fazendo agora? (rode durante a carga)

# COMMAND ----------

import pandas as pd

atividade = executar_sql_lakebase(
    """SELECT coalesce(application_name, '') AS app, state, count(*) AS conexoes,
              max(now() - query_start) FILTER (WHERE state = 'active') AS query_mais_longa
       FROM pg_stat_activity WHERE datname = current_database()
       GROUP BY 1, 2 ORDER BY 3 DESC""",
    endpoint=ENDPOINT_DEV,
)
display(pd.DataFrame(atividade, columns=["application_name", "state", "conexoes", "query_mais_longa"]))

top = executar_sql_lakebase(
    """SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS consulta, calls,
              round(mean_exec_time::numeric, 1) AS media_ms, round(total_exec_time::numeric / 1000, 1) AS total_s
       FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
       ORDER BY total_exec_time DESC LIMIT 8""",
    endpoint=ENDPOINT_DEV,
)
display(pd.DataFrame(top, columns=["consulta", "chamadas", "media_ms", "total_s"]))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 3 — Scale-to-zero
# MAGIC Pare a carga, desligue o **polling** no app de dev (switch "Auto 10s") e aguarde: o pool do app fecha as conexões
# MAGIC ociosas em 60 s (`DB_POOL_MIN=0`, `DB_POOL_MAX_IDLE=60`) e, 60 s depois, o compute suspende.
# MAGIC
# MAGIC > Esta célula consulta só a **API** (não abre conexão Postgres — senão manteria o compute acordado).

# COMMAND ----------

import time

inicio = time.time()
while time.time() - inicio < 600:
    e = estado_endpoint()
    print(f"{time.strftime('%H:%M:%S')}  {e['estado']:8s} último ativo: {e['ultimo_ativo']}")
    if e["estado"] == "IDLE":
        print("😴 compute suspenso — custo de compute zero até a próxima conexão")
        break
    time.sleep(20)

# COMMAND ----------

# MAGIC %md
# MAGIC Agora abra o app de dev (http://localhost:8081) › **Conexão Lakebase**: a primeira requisição acorda o compute
# MAGIC (latência maior só nela) e o estado volta para `ACTIVE`.
# MAGIC
# MAGIC ## Passo 4 — Quanto custou? (system tables)
# MAGIC As tags do projeto (`workshop = lakebase-energia`) aparecem no billing — use-as para chargeback por aplicação.

# COMMAND ----------

try:
    display(spark.sql("""
    SELECT usage_date, billing_origin_product, sku_name, round(sum(usage_quantity), 3) AS quantidade, usage_unit
    FROM system.billing.usage
    WHERE usage_date >= current_date() - INTERVAL 7 DAYS
      AND (custom_tags['workshop'] = 'lakebase-energia' OR billing_origin_product ILIKE '%DATABASE%' OR billing_origin_product ILIKE '%LAKEBASE%')
    GROUP BY ALL ORDER BY usage_date DESC, quantidade DESC
    """))
except Exception as e:
    print(f"ℹ️ system.billing.usage indisponível para este usuário: {str(e)[:150]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## (Opcional) Réplica de leitura — escalar leitura sem tocar na escrita
# MAGIC Um endpoint **READ_ONLY** no mesmo branch lê o **mesmo storage** (sem duplicar dados). Ideal para dashboards e
# MAGIC relatórios pesados. No CLI:
# MAGIC ```bash
# MAGIC databricks postgres create-endpoint projects/energia-workshop/branches/production leitura \
# MAGIC   --json '{"spec": {"endpoint_type": "ENDPOINT_TYPE_READ_ONLY", "autoscaling_limit_min_cu": 0.5, "autoscaling_limit_max_cu": 2}}'
# MAGIC ```
# MAGIC
# MAGIC ✅ **Fim dos labs!** Volte ao [README](../README.md) para o recap e a limpeza (`99_Cleanup`).
