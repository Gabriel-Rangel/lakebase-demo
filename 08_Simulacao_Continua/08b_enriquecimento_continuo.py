# Databricks notebook source
# MAGIC %md
# MAGIC # 8️⃣ Passo 8b · Enriquecimento contínuo: OLTP → Lakehouse → OLTP, em loop
# MAGIC
# MAGIC Enquanto o simulador (8a) grava OS no Lakebase, este loop fecha o ciclo sem parar:
# MAGIC
# MAGIC ```
# MAGIC  ┌──► ① gold (Passo 4): lê as OS ao vivo via Unity Catalog + telemetria Delta → MERGE health score / KPIs
# MAGIC  │    ② refresh das synced tables (Passo 5): só o que mudou (Change Data Feed) → analitico.* no Lakebase
# MAGIC  │    ③ app mostra backlog, MTTR, disponibilidade e risco atualizados
# MAGIC  └──── espera `intervalo_min` e repete
# MAGIC ```
# MAGIC
# MAGIC | Parâmetro | Padrão | |
# MAGIC |---|---|---|
# MAGIC | `intervalo_min` | 1 | pausa entre as voltas |
# MAGIC | `duracao_min` | 60 | `0` = até cancelar o job |
# MAGIC
# MAGIC > ▶️ Tarefa `enriquecimento_continuo` do job **Passo 8 · Simulação contínua**. Cada volta leva ~2–3 min
# MAGIC > (gold serverless + pipelines das synced tables).
# MAGIC > 💡 Precisa de latência de segundos? Crie as synced tables em modo **CONTINUOUS** — o pipeline fica sempre ligado.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.text("intervalo_min", "1", "Pausa entre voltas (min)")
dbutils.widgets.text("duracao_min", "60", "Duração (min, 0 = sem fim)")
INTERVALO_MIN = float(dbutils.widgets.get("intervalo_min"))
DURACAO_MIN = float(dbutils.widgets.get("duracao_min"))

PARAMETROS = {k: dbutils.widgets.get(k) for k in
              ("catalogo", "schema", "projeto_lakebase", "database", "catalogo_lakebase", "warehouse_id")}
SYNCED_TRIGGERED = ["saude_equipamentos", "kpis_manutencao", "telemetria_diaria"]

# COMMAND ----------

import time
from databricks.sdk.service.pipelines import UpdateInfoState

FINAIS = {UpdateInfoState.COMPLETED, UpdateInfoState.FAILED, UpdateInfoState.CANCELED}
PIPELINES = {
    nome: w.postgres.get_synced_table(name=f"synced_tables/{CATALOGO_LAKEBASE}.{SCHEMA_ANALITICO}.{nome}").status.pipeline_id
    for nome in SYNCED_TRIGGERED
}
print("pipelines das synced tables:", PIPELINES)


def refresh_synced(timeout_s=600):
    """Dispara um update em cada pipeline TRIGGERED e espera todos terminarem."""
    updates = {}
    for nome, pipeline_id in PIPELINES.items():
        try:
            updates[nome] = (pipeline_id, w.pipelines.start_update(pipeline_id=pipeline_id).update_id)
        except Exception as e:  # noqa: BLE001 — ex.: update anterior ainda rodando
            print(f"   ⚠️ {nome}: {str(e)[:120]}")
    inicio = time.time()
    while updates and time.time() - inicio < timeout_s:
        time.sleep(5)
        for nome, (pipeline_id, update_id) in list(updates.items()):
            estado = w.pipelines.get_update(pipeline_id=pipeline_id, update_id=update_id).update.state
            if estado in FINAIS:
                if estado != UpdateInfoState.COMPLETED:
                    print(f"   ❌ {nome}: {estado.value}")
                updates.pop(nome)


def resumo_lakebase():
    kpis = executar_sql_lakebase(f"""
        SELECT DISTINCT ON (unidade) unidade, backlog_os, mttr_horas, disponibilidade_pct
        FROM {SCHEMA_ANALITICO}.kpis_manutencao ORDER BY unidade, data_referencia DESC""")
    risco = executar_sql_lakebase(f"""
        SELECT count(*) FILTER (WHERE risco = 'CRITICO'), count(*) FILTER (WHERE risco = 'ALTO')
        FROM {SCHEMA_ANALITICO}.saude_equipamentos""")[0]
    partes = " | ".join(f"{u.replace('FPSO ', '')}: backlog {b}, MTTR {m or 0:.1f}h, disp {d:.1f}%" for u, b, m, d in kpis)
    return f"{partes} | 🔴 {risco[0]} crítico(s) · 🟠 {risco[1]} alto(s)"

# COMMAND ----------

# MAGIC %md
# MAGIC ## ▶️ Loop de enriquecimento

# COMMAND ----------

inicio = time.time()
fim = inicio + DURACAO_MIN * 60 if DURACAO_MIN > 0 else float("inf")
volta = 0
print(f"▶️ enriquecimento contínuo: pausa de {INTERVALO_MIN:g} min · {'sem fim' if DURACAO_MIN <= 0 else f'{DURACAO_MIN:g} min'}")
while time.time() < fim:
    volta += 1
    t0 = time.time()
    try:
        dbutils.notebook.run("../04_Enriquecimento_Lakehouse/04_camada_gold", 900, PARAMETROS)   # ① gold
        t_gold = time.time() - t0
        refresh_synced()                                                                          # ② synced tables
        t_sync = time.time() - t0 - t_gold
        executar_script_lakebase([                                                                # GRANT idempotente
            f"GRANT USAGE ON SCHEMA {SCHEMA_ANALITICO} TO energia_app",
            f"GRANT SELECT ON ALL TABLES IN SCHEMA {SCHEMA_ANALITICO} TO energia_app",
        ])
        print(f"🔁 {time.strftime('%H:%M:%S')} volta {volta}: gold {t_gold:.0f}s + sync {t_sync:.0f}s → {resumo_lakebase()}")
    except Exception as e:  # noqa: BLE001 — uma volta com erro não derruba o loop
        print(f"   ⚠️ volta {volta}: {type(e).__name__}: {str(e)[:200]}")
    time.sleep(max(0, min(INTERVALO_MIN * 60, fim - time.time())))

print(f"⏹️ fim: {volta} voltas em {(time.time() - inicio) / 60:.1f} min")
