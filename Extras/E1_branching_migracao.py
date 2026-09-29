# Databricks notebook source
# MAGIC %md
# MAGIC # 🧪 Extra 1 · Branching: teste a migração sem tocar em produção
# MAGIC
# MAGIC **"Trate seu banco de dados como código."** Um branch do Lakebase é uma cópia **zero-copy** (copy-on-write) do banco:
# MAGIC
# MAGIC | | |
# MAGIC |---|---|
# MAGIC | ⚡ **Instantâneo** | segundos, independente do tamanho do banco — não copia dados |
# MAGIC | 🧬 **Completo** | dados, schemas, roles (inclusive o Service Principal do app), grants |
# MAGIC | 🧱 **Isolado** | compute próprio: carga e migrações no `dev` não afetam `production` |
# MAGIC | ⏳ **Efêmero** | TTL: o branch se apaga sozinho (aqui, 24 h) |
# MAGIC
# MAGIC **Cenário:** o time de Segurança pediu **bloqueios LOTO** (Lockout/Tagout) nas Permissões de Trabalho.
# MAGIC A migração [`003_bloqueios_loto.sql`](../app/backend/migrations/003_bloqueios_loto.sql) altera uma tabela com dados de produção.
# MAGIC Vamos validá-la num branch `dev` com **dados reais**, rodando o app de dev **ao lado** do de produção.
# MAGIC
# MAGIC ```
# MAGIC production ──●────────────────●──────────▶   app :8080  (schema v2)
# MAGIC               \\
# MAGIC  dev (TTL 24h) ●── migração 003 ──●──▶      app :8081  (schema v3 · LOTO)
# MAGIC ```

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

dbutils.widgets.text("branch_id", "dev", "Nome do branch")
BRANCH_ID = dbutils.widgets.get("branch_id")
BRANCH_DEV = f"projects/{PROJETO}/branches/{BRANCH_ID}"
ENDPOINT_DEV = f"{BRANCH_DEV}/endpoints/primary"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 1 — Criar o branch `dev` a partir de `production`
# MAGIC UI: projeto › **Branches** › **Create branch** › source `production` › *Expire after* 24 h.

# COMMAND ----------

import time
from databricks.sdk.errors import NotFound
from databricks.sdk.service.postgres import Branch

try:
    branch = w.postgres.get_branch(name=BRANCH_DEV)
    print(f"ℹ️ Branch {BRANCH_ID} já existe")
except NotFound:
    t0 = time.time()
    branch = w.postgres.create_branch(
        parent=f"projects/{PROJETO}",
        branch=Branch.from_dict({"spec": {"source_branch": BRANCH_PROD, "ttl": "86400s"}}),
        branch_id=BRANCH_ID,
    ).wait()
    print(f"✅ Branch {BRANCH_ID} criado em {time.time() - t0:.0f}s — sem copiar dados")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 2 — Compute do branch (com scale-to-zero agressivo: 60 s)
# MAGIC O branch ganha um endpoint read-write com as configurações padrão do projeto. Deixamos o *suspend* em **60 s**
# MAGIC para ver o **scale-to-zero** no Extra 2.

# COMMAND ----------

import time
from databricks.sdk.common.types.fieldmask import FieldMask
from databricks.sdk.service.postgres import Endpoint

endpoints = list(w.postgres.list_endpoints(parent=BRANCH_DEV))
if not endpoints:
    w.postgres.create_endpoint(
        parent=BRANCH_DEV,
        endpoint=Endpoint.from_dict({"spec": {"endpoint_type": "ENDPOINT_TYPE_READ_WRITE",
                                              "autoscaling_limit_min_cu": 0.5, "autoscaling_limit_max_cu": 2,
                                              "suspend_timeout_duration": "60s"}}),
        endpoint_id="primary",
    ).wait()
    print("✅ endpoint criado")
else:
    ENDPOINT_DEV = endpoints[0].name
    w.postgres.update_endpoint(
        name=ENDPOINT_DEV,
        endpoint=Endpoint.from_dict({"spec": {"endpoint_type": "ENDPOINT_TYPE_READ_WRITE", "suspend_timeout_duration": "60s"}}),
        update_mask=FieldMask(["spec.suspend_timeout_duration"]),
    ).wait()
    print(f"ℹ️ endpoint {ENDPOINT_DEV} já existia — suspend ajustado para 60s")

for _ in range(60):
    ep = w.postgres.get_endpoint(name=ENDPOINT_DEV)
    if ep.status.hosts and ep.status.hosts.host:
        break
    time.sleep(5)
HOST_DEV = ep.status.hosts.host
print(f"🐘 {ENDPOINT_DEV}\n   host: {HOST_DEV}\n   estado: {ep.status.current_state.value if ep.status.current_state else '?'}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 3 — Apontar um segundo app para o branch
# MAGIC No terminal, a partir de `app/`:
# MAGIC ```bash
# MAGIC cp .env .env.dev          # mesmas credenciais: a role do Service Principal foi herdada pelo branch
# MAGIC ```
# MAGIC Edite **apenas** estas linhas do `.env.dev` (valores impressos abaixo):

# COMMAND ----------

print(f"""APP_AMBIENTE=dev
LAKEBASE_ENDPOINT={ENDPOINT_DEV}
PGHOST={HOST_DEV}
DB_POOL_MIN=0
DB_POOL_MAX_IDLE=60""")

# COMMAND ----------

# MAGIC %md
# MAGIC Suba o app de dev **ao lado** do de produção, já aplicando a migração 003:
# MAGIC ```bash
# MAGIC APP_ENV_FILE=.env.dev FRONTEND_PORT=8081 MIGRATE_TARGET=3 docker compose -p energia-dev up -d --build
# MAGIC ```
# MAGIC | | Produção — http://localhost:8080 | Dev — http://localhost:8081 |
# MAGIC |---|---|---|
# MAGIC | badge | 🟢 `branch: production` · `schema v2` | 🟠 `branch: dev` · `schema v3` |
# MAGIC | PT | sem LOTO | seção **Bloqueios LOTO** + regra "sem cadeado não inicia" |
# MAGIC | dados | os mesmos no momento do branch | idem — e daqui em diante divergem |
# MAGIC
# MAGIC 👉 Teste no dev: solicite uma PT com **"Requer bloqueio LOTO"**, aprove (persona Supervisor), tente **Iniciar** sem cadeado (bloqueado ✋),
# MAGIC aplique um cadeado e inicie. Nada disso existe — nem quebra — em produção.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Passo 4 — Conferir: produção intacta, dev migrado

# COMMAND ----------

def estado_schema(endpoint):
    return executar_sql_lakebase(
        """SELECT (SELECT max(versao) FROM operacao.schema_migrations) AS versao,
                  to_regclass('operacao.bloqueios_loto') IS NOT NULL AS tem_loto,
                  (SELECT count(*) FROM operacao.ordens_servico) AS ordens""",
        endpoint=endpoint,
    )[0]

for nome, ep_name in (("production", ENDPOINT_PROD), (BRANCH_ID, ENDPOINT_DEV)):
    versao, loto, ordens = estado_schema(ep_name)
    print(f"{nome:12s} schema v{versao} · tabela bloqueios_loto: {'✅' if loto else '—'} · {ordens} OS")

# COMMAND ----------

# MAGIC %md
# MAGIC > 💡 **Pontos de atenção**
# MAGIC > - O catálogo `energia_lakebase` e as synced tables continuam ligados a **production** (no branch, as tabelas `analitico.*` são uma foto do momento do branch).
# MAGIC > - UI: projeto › branch `dev` › **Schema diff** compara o schema do branch com o pai.
# MAGIC
# MAGIC ## Passo 5 — Promover e limpar
# MAGIC Validou? Aplique a **mesma** migração em produção (é só SQL versionado):
# MAGIC ```bash
# MAGIC MIGRATE_TARGET=3 docker compose run --rm migrate      # produção vai para v3
# MAGIC docker compose -p energia-dev down                      # derruba o app de dev
# MAGIC ```
# MAGIC Depois apague o branch (ou deixe o TTL fazer isso). **Antes do Extra 2**, mantenha o branch — vamos usá-lo para ver o scale-to-zero.

# COMMAND ----------

dbutils.widgets.dropdown("apagar_branch", "nao", ["nao", "sim"], "Apagar o branch agora?")
if dbutils.widgets.get("apagar_branch") == "sim":
    w.postgres.delete_branch(name=BRANCH_DEV).wait()
    print(f"🗑️ Branch {BRANCH_ID} apagado")
