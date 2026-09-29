# Databricks notebook source
# MAGIC %md
# MAGIC # ⚙️ Passo 0 · Os dados que já existem no Lakehouse (Delta)
# MAGIC
# MAGIC Simulamos o lado **analítico** da *Brickhouse Energia* (operadora fictícia com 3 FPSOs):
# MAGIC
# MAGIC | Tabela Delta | Origem simulada | Linhas |
# MAGIC |---|---|---|
# MAGIC | `equipamentos` | cadastro mestre (ex.: ERP / SAP PM) — arquivo [`dados/equipamentos.csv`](../dados/equipamentos.csv) | 45 |
# MAGIC | `telemetria_sensores` | historian / IoT dos FPSOs — leituras a cada 10 min, últimos 30 dias | ~194 mil |
# MAGIC
# MAGIC Alguns equipamentos estão **degradando** nos últimos 10 dias (vibração, temperatura, pressão ou corrente fora da linha de base).
# MAGIC É isso que o Lakehouse vai detectar no Passo 4 e devolver para o app via synced table no Passo 5.
# MAGIC
# MAGIC > ✅ Tempo de execução: ~1 min em serverless.

# COMMAND ----------

# MAGIC %run ./00_configuracao

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.{SCHEMA} COMMENT 'Workshop Lakebase — Brickhouse Energia'")
spark.sql(f"USE {CATALOGO}.{SCHEMA}")
print(f"✅ Schema {CATALOGO}.{SCHEMA} pronto")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Cadastro de equipamentos
# MAGIC `CHANGE DATA FEED` ligado: requisito para synced tables no modo **TRIGGERED/CONTINUOUS** (Passo 5).

# COMMAND ----------

import os
import pandas as pd

caminho_csv = os.path.abspath("../dados/equipamentos.csv")
pdf = pd.read_csv(caminho_csv, parse_dates=["data_instalacao"])
pdf["potencia_kw"] = pdf["potencia_kw"].astype("int32")
pdf["data_instalacao"] = pdf["data_instalacao"].dt.date

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {T_EQUIPAMENTOS} (
  tag STRING NOT NULL COMMENT 'Tag do equipamento (chave)',
  nome STRING, tipo STRING, unidade STRING COMMENT 'FPSO', sistema STRING,
  criticidade STRING COMMENT 'A = mais crítico', fabricante STRING, modelo STRING,
  potencia_kw INT, data_instalacao DATE,
  CONSTRAINT equipamentos_pk PRIMARY KEY (tag)
) TBLPROPERTIES (delta.enableChangeDataFeed = true)
COMMENT 'Cadastro mestre de equipamentos dos FPSOs (simula ERP)'
""")

spark.createDataFrame(pdf).createOrReplaceTempView("equipamentos_csv")
spark.sql(f"""
MERGE INTO {T_EQUIPAMENTOS} t USING equipamentos_csv s ON t.tag = s.tag
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")
display(spark.table(T_EQUIPAMENTOS).groupBy("unidade", "tipo").count().orderBy("unidade", "tipo"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Telemetria dos sensores (30 dias, a cada 10 min)
# MAGIC
# MAGIC Equipamentos com degradação simulada (rampa nos últimos 10 dias):
# MAGIC
# MAGIC | Tag | Sinal | Severidade esperada |
# MAGIC |---|---|---|
# MAGIC | `ATL-K-2101A` | vibração +120% | 🔴 crítico |
# MAGIC | `GUA-B-1101A` | temperatura +15% e vibração +40% | 🟠 alto |
# MAGIC | `TUP-TG-3101B` | vibração +70% | 🟠 alto |
# MAGIC | `ATL-B-1201B` | pressão −20% | 🟡 médio |
# MAGIC | `GUA-E-5101` | temperatura +10% | 🟡 médio |
# MAGIC | `TUP-K-2201` | corrente +20% | 🟡 médio |

# COMMAND ----------

from pyspark.sql import functions as F

DIAS, PASSO_MIN = 30, 10
N_LEITURAS = DIAS * 24 * 60 // PASSO_MIN

# Linha de base por tipo de equipamento: (vibração mm/s, temperatura °C, pressão bar, corrente A)
BASE = {
    "BOMBA": (2.5, 65.0, 95.0, 180.0),
    "COMPRESSOR": (3.5, 95.0, 180.0, 520.0),
    "TURBOGERADOR": (4.0, 480.0, 15.0, 1200.0),
    "SEPARADOR": (0.8, 70.0, 12.0, 5.0),
    "TROCADOR": (0.6, 55.0, 30.0, 5.0),
}
# Degradação: tag -> multiplicadores ao final da rampa (vib, temp, pres, corr)
DEGRADACAO = {
    "ATL-K-2101A": (2.20, 1.00, 1.00, 1.00),
    "GUA-B-1101A": (1.40, 1.15, 1.00, 1.00),
    "TUP-TG-3101B": (1.70, 1.00, 1.00, 1.00),
    "ATL-B-1201B": (1.00, 1.00, 0.80, 1.00),
    "GUA-E-5101": (1.00, 1.10, 1.00, 1.00),
    "TUP-K-2201": (1.00, 1.00, 1.00, 1.20),
}

base_df = spark.createDataFrame([(k, *v) for k, v in BASE.items()], "tipo string, b_vib double, b_temp double, b_pres double, b_corr double")
deg_df = spark.createDataFrame([(k, *v) for k, v in DEGRADACAO.items()], "tag string, d_vib double, d_temp double, d_pres double, d_corr double")

inicio = F.expr(f"date_trunc('HOUR', current_timestamp()) - INTERVAL {DIAS} DAYS")
leituras = spark.range(N_LEITURAS).withColumn("leitura_em", F.timestamp_seconds(F.unix_timestamp(inicio) + F.col("id") * PASSO_MIN * 60))

# progresso da rampa de degradação: 0 antes dos últimos 10 dias, 1 no fim
rampa = F.greatest(F.lit(0.0), (F.col("id") - F.lit(N_LEITURAS * 2 / 3)) / F.lit(N_LEITURAS / 3))
ciclo = F.sin(F.hour("leitura_em") / 24.0 * 2 * 3.14159)  # variação diária (carga/temperatura ambiente)

def sinal(base_col, deg_col, ruido, seed, amplitude_ciclo):
    fator_deg = 1 + (F.coalesce(F.col(deg_col), F.lit(1.0)) - 1) * rampa
    return F.round(F.col(base_col) * fator_deg * (1 + amplitude_ciclo * ciclo + ruido * F.randn(seed)), 3)

telemetria = (
    spark.table(T_EQUIPAMENTOS).select("tag", "unidade", "tipo")
    .join(base_df, "tipo").join(deg_df, "tag", "left").crossJoin(leituras)
    .select(
        "tag", "unidade", "tipo", "leitura_em",
        sinal("b_vib", "d_vib", 0.04, 1, 0.02).alias("vibracao_mm_s"),
        sinal("b_temp", "d_temp", 0.01, 2, 0.01).alias("temperatura_c"),
        sinal("b_pres", "d_pres", 0.015, 3, 0.005).alias("pressao_bar"),
        sinal("b_corr", "d_corr", 0.02, 4, 0.03).alias("corrente_a"),
    )
)

telemetria.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(T_TELEMETRIA)
spark.sql(f"ALTER TABLE {T_TELEMETRIA} SET TBLPROPERTIES (delta.enableChangeDataFeed = true)")
spark.sql(f"COMMENT ON TABLE {T_TELEMETRIA} IS 'Telemetria (historian) dos FPSOs — leituras a cada 10 minutos'")
print(f"✅ {spark.table(T_TELEMETRIA).count():,} leituras em {T_TELEMETRIA}")

# COMMAND ----------

display(spark.sql(f"""
SELECT tag, date(leitura_em) AS dia, round(avg(vibracao_mm_s), 2) AS vibracao, round(avg(temperatura_c), 1) AS temperatura
FROM {T_TELEMETRIA}
WHERE tag IN ('ATL-K-2101A', 'ATL-K-2101B')
GROUP BY ALL ORDER BY tag, dia
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Lakehouse pronto.** Próximo passo: [**Passo 1 — criar o projeto Lakebase**](../01_Criar_Projeto_Lakebase/01_criar_projeto_lakebase).
