# Databricks notebook source
# MAGIC %md
# MAGIC # 5️⃣ Passo 5 · Synced tables: o Lakehouse devolve inteligência para o Lakebase
# MAGIC
# MAGIC Uma **synced table** mantém uma cópia **somente leitura** de uma tabela Delta dentro do Postgres do Lakebase,
# MAGIC gerenciada por um pipeline serverless (reverse ETL sem código). O app lê com SQL comum e **latência de milissegundos**.
# MAGIC
# MAGIC | Synced table (Postgres `analitico.*`) | Origem (Delta) | Modo |
# MAGIC |---|---|---|
# MAGIC | `equipamentos` | cadastro mestre | **SNAPSHOT**: cópia completa quando disparado |
# MAGIC | `saude_equipamentos` | `gold_saude_equipamentos` | **TRIGGERED**: incremental via Change Data Feed |
# MAGIC | `kpis_manutencao` | `gold_kpis_manutencao` | **TRIGGERED** |
# MAGIC | `telemetria_diaria` | `gold_telemetria_diaria` | **TRIGGERED** |
# MAGIC
# MAGIC > **CONTINUOUS** (streaming, ~segundos) também existe — use quando o app precisa do dado analítico quase em tempo real.
# MAGIC
# MAGIC ## Opção A — pela UI
# MAGIC Catalog › tabela `gold_saude_equipamentos` › **Create** › **Synced table** › catálogo `energia_lakebase`, schema `analitico`,
# MAGIC chave primária `tag`, modo **Triggered**.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

SYNCED = [
    # (tabela no Postgres, origem Delta, chave primária, modo)
    ("equipamentos", T_EQUIPAMENTOS, ["tag"], "SNAPSHOT"),
    ("saude_equipamentos", T_GOLD_SAUDE, ["tag"], "TRIGGERED"),
    ("kpis_manutencao", T_GOLD_KPIS, ["unidade", "data_referencia"], "TRIGGERED"),
    ("telemetria_diaria", T_GOLD_TELEMETRIA_DIARIA, ["tag", "data"], "TRIGGERED"),
]

def spec_synced(origem, pk, modo):
    return {"spec": {
        "source_table_full_name": origem,
        "branch": BRANCH_PROD,
        "postgres_database": DATABASE,
        "primary_key_columns": pk,
        "scheduling_policy": modo,
        "create_database_objects_if_missing": True,           # cria o schema "analitico" no Postgres
        "new_pipeline_spec": {"storage_catalog": CATALOGO, "storage_schema": SCHEMA},
    }}

import json
print(json.dumps(spec_synced(T_GOLD_SAUDE, ["tag"], "TRIGGERED"), indent=2))

# COMMAND ----------

# MAGIC %md
# MAGIC Equivalente no CLI:
# MAGIC ```bash
# MAGIC databricks postgres create-synced-table energia_lakebase.analitico.saude_equipamentos --json @spec.json
# MAGIC ```

# COMMAND ----------

from databricks.sdk.errors import NotFound
from databricks.sdk.service.postgres import SyncedTable

operacoes = []
for nome, origem, pk, modo in SYNCED:
    synced_id = f"{CATALOGO_LAKEBASE}.{SCHEMA_ANALITICO}.{nome}"
    try:
        w.postgres.get_synced_table(name=f"synced_tables/{synced_id}")
        print(f"ℹ️ {synced_id} já existe")
    except NotFound:
        op = w.postgres.create_synced_table(synced_table=SyncedTable.from_dict(spec_synced(origem, pk, modo)),
                                            synced_table_id=synced_id)
        operacoes.append((synced_id, op))
        print(f"⏳ {synced_id} ← {origem} ({modo})")

for synced_id, op in operacoes:
    op.wait()
    print(f"✅ {synced_id} criada")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Acompanhando o primeiro sincronismo
# MAGIC A carga inicial (snapshot) começa automaticamente. Cada synced table tem um **pipeline** (Lakeflow) — veja em **Jobs & Pipelines**.

# COMMAND ----------

import time

def status_synced():
    linhas = []
    for nome, *_ in SYNCED:
        st = w.postgres.get_synced_table(name=f"synced_tables/{CATALOGO_LAKEBASE}.{SCHEMA_ANALITICO}.{nome}").status
        linhas.append((nome, st.detailed_state.value if st.detailed_state else "?", st.pipeline_id,
                       st.last_sync_time.ToDatetime().isoformat() if st.last_sync_time else None))
    return linhas

for _ in range(60):
    estados = status_synced()
    if all("ONLINE" in e[1] or "FAILED" in e[1] for e in estados):
        break
    time.sleep(15)
for nome, estado, pipeline, ultimo in estados:
    print(f"{'✅' if 'ONLINE' in estado else '⚠️'} {nome:22s} {estado:40s} pipeline={pipeline} último sync={ultimo}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 🔐 GRANT: a role do app pode ler o schema `analitico`
# MAGIC As synced tables pertencem a uma role interna do Databricks (`databricks_writer_*`). Como qualquer tabela Postgres, o app só
# MAGIC lê o que receber via `GRANT`. Damos o acesso à **role de aplicação** `energia_app` — no Passo 6 o Service Principal vira membro dela.
# MAGIC Rode esta célula de novo sempre que **recriar** uma synced table.

# COMMAND ----------

GRANTS = [
    f"GRANT USAGE ON SCHEMA {SCHEMA_ANALITICO} TO energia_app",
    f"GRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA_ANALITICO} TO energia_app",
]
executar_script_lakebase(GRANTS)
donos = executar_sql_lakebase(
    "SELECT tablename, tableowner, has_table_privilege('energia_app', schemaname || '.' || tablename, 'SELECT') "
    "FROM pg_tables WHERE schemaname = :schema ORDER BY 1",
    schema=SCHEMA_ANALITICO,
)
for t in donos:
    print(f"{'✅' if t[2] else '❌'} analitico.{t[0]:22s} dono={t[1]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 👀 Os dados do Lakehouse já estão no Postgres
# MAGIC Consulta direta no Lakebase (é o que o app vai ler no Passo 7, em milissegundos):

# COMMAND ----------

import pandas as pd

top = executar_sql_lakebase(f"""
SELECT e.tag, e.nome, e.unidade, s.health_score, s.risco, s.principal_sinal
FROM {SCHEMA_ANALITICO}.saude_equipamentos s JOIN {SCHEMA_ANALITICO}.equipamentos e USING (tag)
ORDER BY s.health_score LIMIT 8""")
display(pd.DataFrame(top, columns=["tag", "nome", "unidade", "health_score", "risco", "principal_sinal"]))

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Checkpoint:** 4 synced tables `ONLINE` e o `GRANT` aplicado.
# MAGIC Próximo: [**Passo 6 — Service Principal e grants**](../06_Service_Principal_e_Grants/README.md).
# MAGIC
# MAGIC > 🔁 [`05b_uma_volta_do_loop`](./05b_uma_volta_do_loop) faz **manualmente** uma volta completa (pico de telemetria → gold → refresh).
# MAGIC > No Passo 8 isso vira um job contínuo.
