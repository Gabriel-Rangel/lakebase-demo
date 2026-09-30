# Databricks notebook source
# MAGIC %md
# MAGIC # 3️⃣ Passo 3.4 · Transacional ⨝ Analítico na mesma consulta
# MAGIC
# MAGIC Pré-requisito: catálogo `energia_lakebase` criado na UI (Passo 3.1) — o nome precisa bater com o widget `catalogo_lakebase`.
# MAGIC
# MAGIC Aqui está o "único ecossistema": **uma consulta SQL** junta
# MAGIC - as **ordens de serviço** que acabaram de ser gravadas pelo app no **Lakebase** (catálogo `energia_lakebase`), com
# MAGIC - a **telemetria** e o **cadastro** no **Delta** (catálogo `gabriel_dev`).
# MAGIC
# MAGIC Sem ETL, sem cópia, sem job de integração — e com a governança do Unity Catalog.
# MAGIC
# MAGIC > 💡 As mesmas consultas rodam no **SQL Editor** (SQL Warehouse serverless), em dashboards AI/BI e no Genie.

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

OS_LAKEBASE = f"{CATALOGO_LAKEBASE}.{SCHEMA_OLTP}.ordens_servico"
PT_LAKEBASE = f"{CATALOGO_LAKEBASE}.{SCHEMA_OLTP}.permissoes_trabalho"
HIST_LAKEBASE = f"{CATALOGO_LAKEBASE}.{SCHEMA_OLTP}.historico_status"

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Backlog de manutenção por FPSO — direto do OLTP (ao vivo)

# COMMAND ----------

display(spark.sql(f"""
SELECT unidade,
       count(*) FILTER (WHERE status NOT IN ('CONCLUIDA', 'CANCELADA'))                      AS backlog,
       count(*) FILTER (WHERE status NOT IN ('CONCLUIDA', 'CANCELADA') AND prioridade = 'P1') AS p1_abertas,
       count(*) FILTER (WHERE status = 'EM_EXECUCAO')                                       AS em_execucao,
       count(*) FILTER (WHERE origem = 'PREDITIVA_LAKEHOUSE')                               AS geradas_pelo_lakehouse
FROM {OS_LAKEBASE}
GROUP BY unidade ORDER BY unidade
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. 🔎 Equipamentos degradando **sem** ordem de serviço aberta
# MAGIC Telemetria (Delta, ~194 mil leituras) ⨝ OLTP (Lakebase) — o tipo de pergunta que antes exigia um pipeline de integração.

# COMMAND ----------

display(spark.sql(f"""
WITH ultima AS (
  SELECT tag, max(leitura_em) AS fim FROM {T_TELEMETRIA} GROUP BY tag
),
janelas AS (
  SELECT t.tag,
         avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN t.vibracao_mm_s END) AS vib_base,
         avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS  THEN t.vibracao_mm_s END) AS vib_recente,
         avg(CASE WHEN t.leitura_em <  u.fim - INTERVAL 10 DAYS THEN t.temperatura_c END) AS temp_base,
         avg(CASE WHEN t.leitura_em >= u.fim - INTERVAL 6 HOURS  THEN t.temperatura_c END) AS temp_recente
  FROM {T_TELEMETRIA} t JOIN ultima u USING (tag)
  GROUP BY t.tag
),
os_abertas AS (
  SELECT equipamento_tag AS tag, count(*) AS os_abertas
  FROM {OS_LAKEBASE}
  WHERE status NOT IN ('CONCLUIDA', 'CANCELADA')
  GROUP BY 1
)
SELECT e.tag, e.nome, e.unidade, e.criticidade,
       round(100 * (j.vib_recente / j.vib_base - 1), 1)   AS desvio_vibracao_pct,
       round(100 * (j.temp_recente / j.temp_base - 1), 1) AS desvio_temperatura_pct,
       coalesce(o.os_abertas, 0)                          AS os_abertas
FROM {T_EQUIPAMENTOS} e
JOIN janelas j USING (tag)
LEFT JOIN os_abertas o USING (tag)
WHERE abs(j.vib_recente / j.vib_base - 1) > 0.10 OR abs(j.temp_recente / j.temp_base - 1) > 0.05
ORDER BY desvio_vibracao_pct DESC
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Tempo de aprovação das Permissões de Trabalho (trilha de auditoria do OLTP)

# COMMAND ----------

display(spark.sql(f"""
WITH eventos AS (
  SELECT entidade_id AS pt_id,
         min(CASE WHEN para_status = 'SOLICITADA' THEN criado_em END) AS solicitada_em,
         min(CASE WHEN para_status IN ('APROVADA', 'REJEITADA') THEN criado_em END) AS decidida_em
  FROM {HIST_LAKEBASE}
  WHERE entidade = 'PT'
  GROUP BY 1
)
SELECT o.unidade, pt.tipo,
       count(*) AS pts_decididas,
       round(avg((unix_timestamp(e.decidida_em) - unix_timestamp(e.solicitada_em)) / 3600), 2) AS horas_ate_decisao
FROM eventos e
JOIN {PT_LAKEBASE} pt ON pt.id = e.pt_id
JOIN {OS_LAKEBASE} o ON o.id = pt.ordem_id
WHERE e.decidida_em IS NOT NULL
GROUP BY ALL ORDER BY o.unidade, pt.tipo
"""))

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ Próximo: [**Passo 4 — enriquecimento no Lakehouse**](../04_Enriquecimento_Lakehouse/04_camada_gold): transformar esse cruzamento em **health score** e **KPIs**.
