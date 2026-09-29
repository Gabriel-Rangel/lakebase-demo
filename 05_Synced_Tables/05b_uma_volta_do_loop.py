# Databricks notebook source
# MAGIC %md
# MAGIC # 🔁 Passo 5b · Uma volta do loop, manual: OLTP → Lakehouse → OLTP
# MAGIC
# MAGIC ```
# MAGIC  ① app grava OS/PT no Lakebase          ② Lakehouse lê o OLTP via Unity Catalog + telemetria Delta
# MAGIC            ▲                                            │
# MAGIC            │                                            ▼
# MAGIC  ④ app mostra novo risco / KPI   ◄──   ③ gold (MERGE) ──► synced tables (refresh incremental)
# MAGIC ```
# MAGIC
# MAGIC **Roteiro da demo**
# MAGIC 1. Injete um **pico de vibração** em um equipamento saudável (célula 1).
# MAGIC 2. Rode o **gold** e o **refresh das synced tables** (células 2 e 3) — ou o job `atualizar_gold_e_sync`.
# MAGIC 3. No app: o equipamento aparece **🔴 CRITICO** → clique **"Criar OS preditiva"** (grava no Lakebase).
# MAGIC 4. Rode o refresh de novo → o **backlog** do FPSO no Painel aumenta. O loop fechou. ✅
# MAGIC
# MAGIC > Use depois do Passo 7 (app no ar). O **Passo 8** automatiza esta volta como um job contínuo.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.dropdown("injetar_pico", "nao", ["nao", "sim"], "Injetar pico de vibração?")
dbutils.widgets.text("tag_pico", "TUP-B-1101A", "Tag do equipamento (pico)")
dbutils.widgets.dropdown("rodar_gold", "sim", ["sim", "nao"], "Rodar o gold antes do refresh?")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. (Demo) Pico de vibração nas últimas 3 horas

# COMMAND ----------

if dbutils.widgets.get("injetar_pico") == "sim":
    tag = dbutils.widgets.get("tag_pico")
    spark.sql(f"""
    INSERT INTO {T_TELEMETRIA}
    SELECT tag, unidade, tipo,
           timestampadd(MINUTE, -10 * s.i, current_timestamp()) AS leitura_em,
           round(vibracao_mm_s * (3.0 + rand() * 0.3), 3), temperatura_c * 1.02, pressao_bar, corrente_a * 1.05
    FROM (SELECT * FROM {T_TELEMETRIA} WHERE tag = '{tag}' ORDER BY leitura_em DESC LIMIT 1)
    CROSS JOIN (SELECT explode(sequence(0, 17)) AS i) s
    """)
    print(f"⚡ 18 leituras com vibração ~3x inseridas para {tag}")
else:
    print("ℹ️ sem pico (injetar_pico = nao)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Recalcular o gold (Passo 4)

# COMMAND ----------

if dbutils.widgets.get("rodar_gold") == "sim":
    dbutils.notebook.run("../04_Enriquecimento_Lakehouse/04_camada_gold", 900, {
        k: dbutils.widgets.get(k) for k in ("catalogo", "schema", "projeto_lakebase", "database", "catalogo_lakebase", "warehouse_id")
    })
    print("✅ gold recalculado")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Refresh das synced tables
# MAGIC Cada synced table tem um pipeline serverless. Disparamos um *update*: no modo TRIGGERED só as linhas alteradas
# MAGIC (Change Data Feed) são aplicadas no Postgres.

# COMMAND ----------

import time
from databricks.sdk.service.pipelines import UpdateInfoState

TABELAS = ["equipamentos", "saude_equipamentos", "kpis_manutencao", "telemetria_diaria"]
updates = {}
for nome in TABELAS:
    st = w.postgres.get_synced_table(name=f"synced_tables/{CATALOGO_LAKEBASE}.{SCHEMA_ANALITICO}.{nome}").status
    if nome == "equipamentos":
        continue  # cadastro mestre (SNAPSHOT) — não muda no loop
    updates[nome] = (st.pipeline_id, w.pipelines.start_update(pipeline_id=st.pipeline_id).update_id)
    print(f"⏳ {nome}: update {updates[nome][1]}")

FINAIS = {UpdateInfoState.COMPLETED, UpdateInfoState.FAILED, UpdateInfoState.CANCELED}
inicio = time.time()
pendentes = dict(updates)
while pendentes and time.time() - inicio < 900:
    time.sleep(10)
    for nome, (pipeline_id, update_id) in list(pendentes.items()):
        estado = w.pipelines.get_update(pipeline_id=pipeline_id, update_id=update_id).update.state
        if estado in FINAIS:
            print(f"{'✅' if estado == UpdateInfoState.COMPLETED else '❌'} {nome}: {estado.value} ({time.time() - inicio:.0f}s)")
            pendentes.pop(nome)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Garantir o GRANT (idempotente)

# COMMAND ----------

executar_script_lakebase([
    f"GRANT USAGE ON SCHEMA {SCHEMA_ANALITICO} TO energia_app",
    f"GRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA_ANALITICO} TO energia_app",
])
top = executar_sql_lakebase(
    f"SELECT tag, health_score, risco, principal_sinal FROM {SCHEMA_ANALITICO}.saude_equipamentos ORDER BY health_score LIMIT 5"
)
print("🐘 Lakebase — analitico.saude_equipamentos (o que o app enxerga agora):")
for t in top:
    print(f"   {t[0]:14s} score={t[1]:5.1f} {t[2]:8s} {t[3]}")
