# Databricks notebook source
# MAGIC %md
# MAGIC # 9️⃣ Passo 9 · Carga de leitura: 20 conexões simultâneas
# MAGIC
# MAGIC Simula **dashboards, relatórios e integrações** lendo o Lakebase ao mesmo tempo que o app e o simulador (Passo 8) escrevem.
# MAGIC 20 conexões Postgres independentes executam, sem pausa, as consultas típicas do app:
# MAGIC
# MAGIC | Consulta | Tipo |
# MAGIC |---|---|
# MAGIC | KPIs do painel · lista de OS paginada · OS por id | leituras OLTP curtas (índices) |
# MAGIC | backlog/MTTR por equipamento · busca textual | agregações e *scans* (CPU) |
# MAGIC | equipamentos + saúde · KPIs do Lakehouse | leitura das **synced tables** (`analitico.*`) |
# MAGIC
# MAGIC **O que observar enquanto roda**
# MAGIC 1. Lakebase › projeto › branch `production` › **Monitoring**: CPU/RAM *allocated* subindo (autoscaling até 4 CU), conexões abertas, TPS.
# MAGIC 2. App › **Conexão Lakebase**: a latência do app continua baixa — o compute escala sem reiniciar conexões.
# MAGIC 3. Esta célula imprime QPS e latências p50/p95 a cada 10 s.
# MAGIC
# MAGIC > ▶️ Job **Passo 9 · Carga de leitura (20 conexões)** — parâmetros `conexoes`, `duracao_min`, `volume_historico`.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.text("conexoes", "20", "Conexões simultâneas")
dbutils.widgets.text("duracao_min", "10", "Duração (min)")
dbutils.widgets.text("volume_historico", "100000", "OS históricas para as agregações")
CONEXOES = int(dbutils.widgets.get("conexoes"))
DURACAO_MIN = float(dbutils.widgets.get("duracao_min"))
VOLUME = int(dbutils.widgets.get("volume_historico"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 9.1 Volume para as agregações (uma vez)
# MAGIC Gera OS **históricas** (mais de 90 dias, concluídas) direto no Postgres com `INSERT … SELECT generate_series` —
# MAGIC não mudam os KPIs dos últimos 30 dias nem as telas do app (que mostram as OS mais recentes primeiro).

# COMMAND ----------

import time

historicas = executar_sql_lakebase("SELECT count(*) FROM operacao.ordens_servico WHERE titulo LIKE '[histórico]%'")[0][0]
faltam = max(0, VOLUME - historicas)
if faltam:
    t0 = time.time()
    executar_sql_lakebase(f"""
    INSERT INTO operacao.ordens_servico
      (equipamento_tag, unidade, tipo, prioridade, status, origem, titulo, solicitante_id,
       data_abertura, data_inicio, data_conclusao, horas_indisponivel, atualizado_em)
    SELECT e.tag, e.unidade, (ARRAY['CORRETIVA', 'PREVENTIVA', 'PREDITIVA'])[1 + floor(random() * 3)::int],
           (ARRAY['P1', 'P2', 'P3', 'P4'])[1 + floor(random() * 4)::int],
           CASE WHEN random() < 0.95 THEN 'CONCLUIDA' ELSE 'CANCELADA' END, 'MANUAL',
           '[histórico] ' || (ARRAY['Inspeção de rotina', 'Reparo de vazamento', 'Análise de vibração',
                                    'Troca de filtros', 'Calibração de instrumentos'])[1 + floor(random() * 5)::int] || ' — ' || e.nome,
           t.id, x.abertura, x.abertura + interval '6 hours', x.abertura + interval '6 hours' + x.duracao,
           round((extract(epoch FROM x.duracao) / 3600)::numeric, 2), x.abertura + interval '6 hours' + x.duracao
    FROM generate_series(1, {faltam}) AS g
    CROSS JOIN LATERAL (SELECT tag, unidade, nome FROM {SCHEMA_ANALITICO}.equipamentos WHERE g > 0 ORDER BY random() LIMIT 1) e
    CROSS JOIN LATERAL (SELECT id FROM operacao.usuarios WHERE papel = 'TECNICO' AND unidade = e.unidade ORDER BY random() LIMIT 1) t
    CROSS JOIN LATERAL (SELECT now() - make_interval(days => 91 + floor(random() * 1000)::int) AS abertura,
                               make_interval(secs => (2 + random() * 28) * 3600) AS duracao WHERE g > 0) x
    """)
    executar_sql_lakebase("ANALYZE operacao.ordens_servico")
    print(f"✅ +{faltam:,} OS históricas em {time.time() - t0:.0f}s")
else:
    print(f"ℹ️ já existem {historicas:,} OS históricas")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 9.2 ▶️ 20 conexões simultâneas

# COMMAND ----------

import random
import threading
import time
from collections import defaultdict

max_id = executar_sql_lakebase("SELECT max(id) FROM operacao.ordens_servico")[0][0]
STATUS = ["ABERTA", "PLANEJADA", "AGUARDANDO_PT", "EM_EXECUCAO", "CONCLUIDA"]
CONSULTAS = [
    # (nome, peso, sql, gerador de parâmetros)
    ("painel_kpis", 15, """
        SELECT (SELECT count(*) FROM operacao.ordens_servico WHERE status NOT IN ('CONCLUIDA','CANCELADA')),
               (SELECT count(*) FROM operacao.ordens_servico WHERE status = 'EM_EXECUCAO'),
               (SELECT count(*) FROM operacao.permissoes_trabalho WHERE status = 'SOLICITADA'),
               (SELECT count(*) FROM operacao.ordens_servico WHERE status = 'CONCLUIDA' AND data_conclusao > now() - interval '7 days')""",
     lambda: {}),
    ("lista_os", 15, """
        SELECT o.numero, o.titulo, o.status, o.prioridade, u.nome
        FROM (SELECT * FROM operacao.ordens_servico WHERE status = :status ORDER BY data_abertura DESC LIMIT 50) o
        JOIN operacao.usuarios u ON u.id = o.solicitante_id""",
     lambda: {"status": random.choice(STATUS)}),
    ("os_por_id", 15, "SELECT * FROM operacao.ordens_servico WHERE id = :id",
     lambda: {"id": random.randint(1, max_id)}),
    ("backlog_mttr_por_equipamento", 20, """
        SELECT equipamento_tag, count(*) FILTER (WHERE status NOT IN ('CONCLUIDA','CANCELADA')) AS backlog,
               avg(horas_indisponivel) FILTER (WHERE tipo = 'CORRETIVA') AS mttr
        FROM operacao.ordens_servico GROUP BY 1 ORDER BY 2 DESC""",
     lambda: {}),
    ("busca_textual", 20, """
        SELECT id, numero, titulo FROM operacao.ordens_servico WHERE titulo ILIKE :termo
        ORDER BY data_abertura DESC LIMIT 50""",
     lambda: {"termo": f"%{random.choice(['vibração', 'vazamento', 'filtro', 'rolamento', 'calibração', 'turbogerador'])}%"}),
    ("equipamentos_saude_synced", 10, f"""
        SELECT e.tag, e.nome, s.health_score, s.risco FROM {SCHEMA_ANALITICO}.equipamentos e
        LEFT JOIN {SCHEMA_ANALITICO}.saude_equipamentos s USING (tag) ORDER BY s.health_score""",
     lambda: {}),
    ("kpis_lakehouse_synced", 5, f"""
        SELECT DISTINCT ON (unidade) * FROM {SCHEMA_ANALITICO}.kpis_manutencao ORDER BY unidade, data_referencia DESC""",
     lambda: {}),
]
PESOS = [c[1] for c in CONSULTAS]

lock = threading.Lock()
latencias = defaultdict(list)       # por consulta (execução inteira)
janela = []                         # últimos 10 s
erros = [0]
parar = threading.Event()


def trabalhador(n):
    conn = conectar_lakebase(application_name="carga-leitura")
    while not parar.is_set():
        nome, _, sql, params = random.choices(CONSULTAS, weights=PESOS)[0]
        t0 = time.perf_counter()
        try:
            conn.run(sql, **params())
            ms = (time.perf_counter() - t0) * 1000
            with lock:
                latencias[nome].append(ms)
                janela.append(ms)
        except Exception as e:  # noqa: BLE001
            with lock:
                erros[0] += 1
            print(f"   ⚠️ conexão {n}: {str(e)[:120]}")
            time.sleep(1)
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass
            conn = conectar_lakebase(application_name="carga-leitura")
    conn.close()


def p(valores, q):
    return sorted(valores)[min(len(valores) - 1, int(len(valores) * q))] if valores else 0


threads = [threading.Thread(target=trabalhador, args=(i,), daemon=True) for i in range(CONEXOES)]
for t in threads:
    t.start()
print(f"▶️ {CONEXOES} conexões · {DURACAO_MIN:g} min")
print(f"{'hora':>8} {'consultas/s':>12} {'p50 ms':>8} {'p95 ms':>8} {'erros':>6}")
fim = time.time() + DURACAO_MIN * 60
while time.time() < fim:
    time.sleep(10)
    with lock:
        amostra, janela[:] = list(janela), []
    print(f"{time.strftime('%H:%M:%S'):>8} {len(amostra) / 10:12.1f} {p(amostra, .5):8.1f} {p(amostra, .95):8.1f} {erros[0]:6d}")
parar.set()
for t in threads:
    t.join(timeout=30)

# COMMAND ----------

import pandas as pd

total = sum(len(v) for v in latencias.values())
display(pd.DataFrame(
    [(nome, len(v), round(sum(v) / len(v), 1), round(p(v, .5), 1), round(p(v, .95), 1)) for nome, v in latencias.items()],
    columns=["consulta", "execuções", "média ms", "p50 ms", "p95 ms"]).sort_values("execuções", ascending=False))
print(f"✅ {total:,} consultas em {DURACAO_MIN:g} min = {total / (DURACAO_MIN * 60):.0f} consultas/s com {CONEXOES} conexões · {erros[0]} erros")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 9.3 Observabilidade: o que o Postgres viu
# MAGIC `pg_stat_statements` (habilitado no Passo 2) guarda estatísticas por consulta; o endpoint informa a faixa de autoscaling.

# COMMAND ----------

top = executar_sql_lakebase("""
SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS consulta, calls,
       round(mean_exec_time::numeric, 2) AS media_ms, round(total_exec_time::numeric / 1000, 1) AS total_s
FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC LIMIT 10""")
display(pd.DataFrame(top, columns=["consulta", "chamadas", "média ms", "total s"]))

st = w.postgres.get_endpoint(name=ENDPOINT_PROD).status
print(f"🐘 endpoint {st.current_state.value if st.current_state else '?'} · autoscaling "
      f"{st.autoscaling_limit_min_cu}–{st.autoscaling_limit_max_cu} CU · o CU alocado em cada instante aparece em Monitoring")

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Fim do roteiro!** Extras: [branching + migração](../Extras/E1_branching_migracao) · [scale-to-zero](../Extras/E2_scale_to_zero).
# MAGIC Limpeza: [`99_Cleanup/99_limpeza`](../99_Cleanup/99_limpeza).
