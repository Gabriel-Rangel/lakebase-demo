# Databricks notebook source
# MAGIC %md
# MAGIC # 4️⃣ Passo 4 · Enriquecimento no Lakehouse: health score e KPIs
# MAGIC
# MAGIC | Tabela gold (Delta) | Chave | Combina |
# MAGIC |---|---|---|
# MAGIC | `gold_saude_equipamentos` | `tag` | desvio da telemetria vs. linha de base **+** OS corretivas abertas (Lakebase) |
# MAGIC | `gold_kpis_manutencao` | `unidade, data_referencia` | backlog, MTTR e disponibilidade (Lakebase) **+** equipamentos em risco (gold) |
# MAGIC
# MAGIC O OLTP é lido **pelo catálogo `energia_lakebase`** (Passo 3) — sem ETL, direto do Postgres, com a governança do UC.
# MAGIC | `gold_telemetria_diaria` | `tag, data` | médias diárias da telemetria — tendência no app |
# MAGIC
# MAGIC **Por que `MERGE` e Change Data Feed?** No Passo 5 essas tabelas voltam para o Lakebase como **synced tables TRIGGERED**,
# MAGIC que sincronizam só o que mudou (CDF). `CREATE OR REPLACE` quebraria o sincronismo incremental.
# MAGIC
# MAGIC > 🔁 No Passo 8 este mesmo notebook roda em loop (enriquecimento contínuo), a cada ~1 minuto.

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

OS_LAKEBASE = f"{CATALOGO_LAKEBASE}.{SCHEMA_OLTP}.ordens_servico"

for ddl in [
    f"""CREATE TABLE IF NOT EXISTS {T_GOLD_TELEMETRIA_DIARIA} (
          tag STRING NOT NULL, data DATE NOT NULL,
          vibracao_mm_s DOUBLE, temperatura_c DOUBLE, pressao_bar DOUBLE, corrente_a DOUBLE,
          CONSTRAINT gold_tel_diaria_pk PRIMARY KEY (tag, data))
        TBLPROPERTIES (delta.enableChangeDataFeed = true)
        COMMENT 'Médias diárias da telemetria por equipamento'""",
    f"""CREATE TABLE IF NOT EXISTS {T_GOLD_SAUDE} (
          tag STRING NOT NULL, unidade STRING,
          health_score DOUBLE COMMENT '0–100 (100 = saudável)', risco STRING COMMENT 'BAIXO | MEDIO | ALTO | CRITICO',
          prob_falha_30d DOUBLE, principal_sinal STRING, recomendacao STRING,
          os_corretivas_abertas BIGINT, ultima_leitura TIMESTAMP, atualizado_em TIMESTAMP,
          CONSTRAINT gold_saude_pk PRIMARY KEY (tag))
        TBLPROPERTIES (delta.enableChangeDataFeed = true)
        COMMENT 'Saúde dos equipamentos: telemetria (Delta) + OS abertas (Lakebase via UC)'""",
    f"""CREATE TABLE IF NOT EXISTS {T_GOLD_KPIS} (
          unidade STRING NOT NULL, data_referencia DATE NOT NULL,
          disponibilidade_pct DOUBLE, mttr_horas DOUBLE, backlog_os BIGINT,
          equipamentos_risco_alto BIGINT, health_score_medio DOUBLE, atualizado_em TIMESTAMP,
          CONSTRAINT gold_kpis_pk PRIMARY KEY (unidade, data_referencia))
        TBLPROPERTIES (delta.enableChangeDataFeed = true)
        COMMENT 'KPIs diários de manutenção por FPSO'""",
]:
    spark.sql(ddl)
print("✅ Tabelas gold prontas")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Telemetria diária

# COMMAND ----------

spark.sql(f"""
MERGE INTO {T_GOLD_TELEMETRIA_DIARIA} t
USING (
  SELECT tag, to_date(leitura_em) AS data,
         round(avg(vibracao_mm_s), 3) AS vibracao_mm_s, round(avg(temperatura_c), 2) AS temperatura_c,
         round(avg(pressao_bar), 2) AS pressao_bar, round(avg(corrente_a), 1) AS corrente_a
  FROM {T_TELEMETRIA} GROUP BY 1, 2
) s ON t.tag = s.tag AND t.data = s.data
WHEN MATCHED AND (t.vibracao_mm_s <> s.vibracao_mm_s OR t.temperatura_c <> s.temperatura_c
                  OR t.pressao_bar <> s.pressao_bar OR t.corrente_a <> s.corrente_a) THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")
print("✅ gold_telemetria_diaria")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Health score
# MAGIC
# MAGIC Para cada sinal: desvio da **média das últimas 6h** vs. **linha de base** (leituras com mais de 10 dias), normalizado pela
# MAGIC sensibilidade do sinal (vibração 100%, temperatura 25%, pressão 35%, corrente 40%).
# MAGIC
# MAGIC `score = 100 − 60 × pior_sinal − 15 × média_dos_sinais − 5 × OS_corretivas_abertas` (limitado a 0–100)
# MAGIC
# MAGIC | score | risco |
# MAGIC |---|---|
# MAGIC | ≥ 80 | 🟢 BAIXO |
# MAGIC | 60–80 | 🟡 MEDIO |
# MAGIC | 40–60 | 🟠 ALTO |
# MAGIC | < 40 | 🔴 CRITICO |
# MAGIC
# MAGIC > Em produção, este passo seria um modelo de ML (MLflow + Feature Store) — a arquitetura é a mesma.

# COMMAND ----------

spark.sql(f"""
MERGE INTO {T_GOLD_SAUDE} t
USING (
  WITH ultima AS (SELECT tag, max(leitura_em) AS fim FROM {T_TELEMETRIA} GROUP BY tag),
  janelas AS (
    SELECT t.tag,
      avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN vibracao_mm_s END) AS b_vib,
      avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN temperatura_c END) AS b_temp,
      avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN pressao_bar END)   AS b_pres,
      avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN corrente_a END)    AS b_corr,
      avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS THEN vibracao_mm_s END) AS r_vib,
      avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS THEN temperatura_c END) AS r_temp,
      avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS THEN pressao_bar END)   AS r_pres,
      avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS THEN corrente_a END)    AS r_corr,
      max(u.fim) AS ultima_leitura
    FROM {T_TELEMETRIA} t JOIN ultima u USING (tag) GROUP BY t.tag
  ),
  sinais AS (
    SELECT tag, ultima_leitura,
      r_vib / b_vib - 1 AS s_vib, r_temp / b_temp - 1 AS s_temp, r_pres / b_pres - 1 AS s_pres, r_corr / b_corr - 1 AS s_corr,
      abs(r_vib / b_vib - 1) / 1.00 AS n_vib, abs(r_temp / b_temp - 1) / 0.25 AS n_temp,
      abs(r_pres / b_pres - 1) / 0.35 AS n_pres, abs(r_corr / b_corr - 1) / 0.40 AS n_corr
    FROM janelas
  ),
  os AS (
    SELECT equipamento_tag AS tag,
           count(*) FILTER (WHERE status NOT IN ('CONCLUIDA', 'CANCELADA') AND tipo = 'CORRETIVA') AS os_corretivas_abertas
    FROM {OS_LAKEBASE} GROUP BY 1
  ),
  score AS (
    SELECT e.tag, e.unidade, e.tipo, s.ultima_leitura,
      s.s_vib, s.s_temp, s.s_pres, s.s_corr, s.n_vib, s.n_temp, s.n_pres, s.n_corr,
      coalesce(o.os_corretivas_abertas, 0) AS os_corretivas_abertas,
      greatest(s.n_vib, s.n_temp, s.n_pres, s.n_corr) AS pior,
      round(greatest(0, least(100,
        100 - 60 * greatest(s.n_vib, s.n_temp, s.n_pres, s.n_corr)
            - 15 * (s.n_vib + s.n_temp + s.n_pres + s.n_corr) / 4
            - 5 * coalesce(o.os_corretivas_abertas, 0))), 1) AS health_score
    FROM {T_EQUIPAMENTOS} e JOIN sinais s USING (tag) LEFT JOIN os o USING (tag)
  )
  SELECT tag, unidade, health_score,
    CASE WHEN health_score < 40 THEN 'CRITICO' WHEN health_score < 60 THEN 'ALTO'
         WHEN health_score < 80 THEN 'MEDIO' ELSE 'BAIXO' END AS risco,
    round(1 / (1 + exp((health_score - 45) / 8)), 3) AS prob_falha_30d,
    CASE
      WHEN pior < 0.15 THEN 'Operação dentro da linha de base'
      WHEN pior = n_vib  THEN concat('Vibração ', format_number(abs(s_vib) * 100, 0), '% ', IF(s_vib > 0, 'acima', 'abaixo'), ' da linha de base')
      WHEN pior = n_temp THEN concat('Temperatura ', format_number(abs(s_temp) * 100, 0), '% ', IF(s_temp > 0, 'acima', 'abaixo'), ' da linha de base')
      WHEN pior = n_pres THEN concat('Pressão ', format_number(abs(s_pres) * 100, 0), '% ', IF(s_pres > 0, 'acima', 'abaixo'), ' da linha de base')
      ELSE concat('Corrente ', format_number(abs(s_corr) * 100, 0), '% ', IF(s_corr > 0, 'acima', 'abaixo'), ' da linha de base')
    END AS principal_sinal,
    CASE
      WHEN health_score >= 80 THEN 'Manter o plano de manutenção preventiva'
      WHEN pior = n_vib  THEN 'Programar análise de vibração e inspeção de mancais, balanceamento e alinhamento'
      WHEN pior = n_temp THEN 'Verificar lubrificação e sistema de resfriamento; inspecionar por termografia'
      WHEN pior = n_pres THEN 'Inspecionar selos, válvulas e possíveis vazamentos; aferir a instrumentação'
      ELSE 'Verificar carga do motor, isolamento elétrico e sobrecorrente'
    END AS recomendacao,
    os_corretivas_abertas, ultima_leitura, current_timestamp() AS atualizado_em
  FROM score
) s ON t.tag = s.tag
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")
display(spark.sql(f"SELECT tag, unidade, health_score, risco, prob_falha_30d, principal_sinal FROM {T_GOLD_SAUDE} ORDER BY health_score LIMIT 10"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. KPIs de manutenção por FPSO (um registro por dia)

# COMMAND ----------

spark.sql(f"""
MERGE INTO {T_GOLD_KPIS} t
USING (
  WITH n_eq AS (SELECT unidade, count(*) AS n FROM {T_EQUIPAMENTOS} GROUP BY 1),
  os AS (
    SELECT unidade,
      count(*) FILTER (WHERE status NOT IN ('CONCLUIDA', 'CANCELADA')) AS backlog_os,
      avg(horas_indisponivel)   -- MTTR: tempo médio de reparo das corretivas concluídas nos últimos 30 dias
        FILTER (WHERE tipo = 'CORRETIVA' AND status = 'CONCLUIDA' AND data_conclusao >= current_timestamp() - INTERVAL 30 DAYS) AS mttr_horas,
      sum(horas_indisponivel)
        FILTER (WHERE status = 'CONCLUIDA' AND data_conclusao >= current_timestamp() - INTERVAL 30 DAYS) AS horas_indisponivel_30d
    FROM {OS_LAKEBASE} GROUP BY 1
  ),
  saude AS (
    SELECT unidade, count(*) FILTER (WHERE risco IN ('ALTO', 'CRITICO')) AS equipamentos_risco_alto,
           avg(health_score) AS health_score_medio
    FROM {T_GOLD_SAUDE} GROUP BY 1
  )
  SELECT n.unidade, current_date() AS data_referencia,
         round(100 * (1 - coalesce(os.horas_indisponivel_30d, 0) / (n.n * 720)), 2) AS disponibilidade_pct,
         round(os.mttr_horas, 1) AS mttr_horas,
         coalesce(os.backlog_os, 0) AS backlog_os,
         coalesce(s.equipamentos_risco_alto, 0) AS equipamentos_risco_alto,
         round(s.health_score_medio, 1) AS health_score_medio,
         current_timestamp() AS atualizado_em
  FROM n_eq n LEFT JOIN os USING (unidade) LEFT JOIN saude s USING (unidade)
) s ON t.unidade = s.unidade AND t.data_referencia = s.data_referencia
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")
display(spark.sql(f"SELECT * FROM {T_GOLD_KPIS} WHERE data_referencia = current_date() ORDER BY unidade"))

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Checkpoint:** 1 equipamento 🔴 CRITICO, 3 🟠 ALTO. Próximo: **Passo 5 — synced tables pela UI** (`05_Synced_Tables/README.md`): devolver o gold ao Lakebase.
