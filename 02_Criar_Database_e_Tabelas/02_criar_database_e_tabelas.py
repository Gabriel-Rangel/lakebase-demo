# Databricks notebook source
# MAGIC %md
# MAGIC # 2️⃣ Passo 2 · Criar o database, as roles e as tabelas do app
# MAGIC
# MAGIC Lakebase **é Postgres**: database, roles, `GRANT`, schemas, constraints, extensões — tudo o que o time já conhece.
# MAGIC
# MAGIC ```
# MAGIC database energia
# MAGIC ├── schema operacao   ← OLTP do app (OS, PT, histórico) — dono: role energia_app
# MAGIC └── schema analitico  ← criado no Passo 5 pelas synced tables (Lakehouse → Lakebase), somente leitura
# MAGIC
# MAGIC energia_app (NOLOGIN)  ← "role de aplicação": dona dos objetos; quem precisa usar o app vira membro dela
# MAGIC ├── <você>                               (agora)
# MAGIC ├── <client-id do Service Principal>     (Passo 6)
# MAGIC └── app_energia                          (role com senha nativa — opcional, Passo 7)
# MAGIC ```
# MAGIC
# MAGIC | Etapa | O que roda | Arquivo |
# MAGIC |---|---|---|
# MAGIC | 2.1 | cria o database `energia` | API (ou UI: branch `production` › **Databases** › **Create database**) |
# MAGIC | 2.2 | roles e schema | SQL abaixo |
# MAGIC | 2.3 | tabelas, índices, constraints | [`001_schema_oltp.sql`](../app/backend/migrations/001_schema_oltp.sql) · [`002_indices_e_comentarios.sql`](../app/backend/migrations/002_indices_e_comentarios.sql) |
# MAGIC | 2.4 | ~90 dias de operação (300 OS) | [`seed_demo.sql`](../app/backend/sql/seed_demo.sql) |
# MAGIC
# MAGIC > 💡 **Pela UI:** abra o projeto › **SQL Editor**, escolha o database `energia` e cole o SQL impresso em cada etapa.
# MAGIC > As migrações são **as mesmas que o app aplica** (serviço `migrate` do Docker) — schema versionado como código.

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2.1 Database `energia`
# MAGIC O database pertence à **sua** role Postgres (criada automaticamente para o dono do projeto).

# COMMAND ----------

from databricks.sdk.service.postgres import Database

dbs = {d.status.postgres_database for d in w.postgres.list_databases(parent=BRANCH_PROD) if d.status}
if DATABASE in dbs:
    print(f"ℹ️ Database {DATABASE} já existe.")
else:
    minha_role = next(r for r in w.postgres.list_roles(parent=BRANCH_PROD) if r.status and r.status.postgres_role == USUARIO)
    w.postgres.create_database(
        parent=BRANCH_PROD,
        database=Database.from_dict({"spec": {"postgres_database": DATABASE, "role": minha_role.name}}),
        database_id=DATABASE,
    ).wait()
    print(f"✅ Database {DATABASE} criado (dono: {USUARIO})")
print("databases no branch:", sorted(d.status.postgres_database for d in w.postgres.list_databases(parent=BRANCH_PROD) if d.status))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2.2 Roles e schema

# COMMAND ----------

BOOTSTRAP = f"""
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'energia_app') THEN
    CREATE ROLE energia_app NOLOGIN;                -- role de aplicação (não faz login)
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_energia') THEN
    CREATE ROLE app_energia LOGIN;                  -- login com senha nativa (senha definida no Passo 6, opcional)
  END IF;
END $$;

GRANT energia_app TO app_energia;
GRANT energia_app TO "{USUARIO}";
GRANT CONNECT, TEMPORARY ON DATABASE {DATABASE} TO energia_app;

CREATE SCHEMA IF NOT EXISTS {SCHEMA_OLTP} AUTHORIZATION energia_app;
COMMENT ON SCHEMA {SCHEMA_OLTP} IS 'OLTP do app Brickhouse Energia (escrito pelo app)';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;   -- observabilidade (Passo 9)
"""
print(BOOTSTRAP)

# COMMAND ----------

conn = conectar_lakebase()
conn.execute_simple(BOOTSTRAP)       # vários comandos de uma vez (protocolo simples do Postgres)
conn.close()
print("✅ Roles e schema criados")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2.3 Tabelas (migrações versionadas)
# MAGIC As regras críticas de negócio ficam **no banco** — nenhum cliente consegue burlá-las:
# MAGIC
# MAGIC | Regra | Como |
# MAGIC |---|---|
# MAGIC | quem solicita a PT não pode aprová-la | `CHECK (aprovador_id <> solicitante_id)` |
# MAGIC | no máximo 1 PT ativa por OS | índice `UNIQUE` parcial `WHERE status IN ('APROVADA','EM_EXECUCAO')` |
# MAGIC | duas pessoas editando a mesma OS | coluna `version` (lock otimista) |
# MAGIC | status válidos | `CHECK (status IN (...))` |
# MAGIC
# MAGIC Rodamos com `SET ROLE energia_app`: as tabelas pertencem à role do app, não a uma pessoa.

# COMMAND ----------

import glob
import os

DIR_MIGRACOES = os.path.abspath("../app/backend/migrations")
MIGRACOES = sorted(m for m in glob.glob(f"{DIR_MIGRACOES}/[0-9][0-9][0-9]_*.sql") if int(os.path.basename(m)[:3]) <= 2)

conn = conectar_lakebase()
conn.run("SET ROLE energia_app")
conn.execute_simple("""
CREATE TABLE IF NOT EXISTS operacao.schema_migrations (
  versao integer PRIMARY KEY, nome text NOT NULL,
  aplicada_em timestamptz NOT NULL DEFAULT now(), aplicada_por text NOT NULL DEFAULT session_user)""")
aplicadas = {r[0] for r in conn.run("SELECT versao FROM operacao.schema_migrations")}
for caminho in MIGRACOES:
    nome = os.path.basename(caminho)
    versao = int(nome[:3])
    if versao in aplicadas:
        print(f"   ✔ {nome} (já aplicada)")
        continue
    sql_migracao = open(caminho, encoding="utf-8").read()
    conn.execute_simple(f"BEGIN;\n{sql_migracao}\n"
                        f"INSERT INTO operacao.schema_migrations (versao, nome) VALUES ({versao}, '{nome[:-4]}');\nCOMMIT;")
    print(f"   ✅ {nome} aplicada")
conn.close()

# COMMAND ----------

print(open(MIGRACOES[0], encoding="utf-8").read()[:2500], "\n…")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2.4 Dados de demonstração (~90 dias de operação)
# MAGIC 12 pessoas (técnicos, supervisores, segurança), 300 OS, as PTs e a trilha de auditoria — gerados **em SQL**
# MAGIC (`generate_series` + `random()`), direto no Postgres. Idempotente: se já houver OS, nada é recriado.

# COMMAND ----------

SEED = open(os.path.abspath("../app/backend/sql/seed_demo.sql"), encoding="utf-8").read()
conn = conectar_lakebase()
conn.run("SET ROLE energia_app")
conn.execute_simple(SEED)
for aviso in conn.notices:
    print("📣", aviso.get(b"M", aviso.get("M")) if isinstance(aviso, dict) else aviso)
conn.close()

# COMMAND ----------

import pandas as pd

resumo = executar_sql_lakebase("""
SELECT 'ordens_servico' AS tabela, count(*) AS linhas FROM operacao.ordens_servico
UNION ALL SELECT 'permissoes_trabalho', count(*) FROM operacao.permissoes_trabalho
UNION ALL SELECT 'historico_status', count(*) FROM operacao.historico_status
UNION ALL SELECT 'usuarios', count(*) FROM operacao.usuarios""")
display(pd.DataFrame(resumo, columns=["tabela", "linhas"]))

status = executar_sql_lakebase("SELECT status, count(*) FROM operacao.ordens_servico GROUP BY 1 ORDER BY 2 DESC")
display(pd.DataFrame(status, columns=["status da OS", "quantidade"]))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Roles do Postgres

# COMMAND ----------

roles = executar_sql_lakebase("""
SELECT r.rolname AS role, r.rolcanlogin AS login, COALESCE(string_agg(m.rolname, ', '), '') AS membro_de
FROM pg_roles r
LEFT JOIN pg_auth_members am ON am.member = r.oid
LEFT JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname IN ('energia_app', 'app_energia') OR r.rolname = current_user
GROUP BY r.rolname, r.rolcanlogin ORDER BY 1
""")
display(pd.DataFrame(roles, columns=["role", "login", "membro_de"]))

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Checkpoint:** `operacao.ordens_servico` com 300 OS. Próximo: [**Passo 3 — registrar no Unity Catalog**](../03_Registrar_no_Unity_Catalog/03a_registrar_catalogo).
