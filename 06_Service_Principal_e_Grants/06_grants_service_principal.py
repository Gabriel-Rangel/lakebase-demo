# Databricks notebook source
# MAGIC %md
# MAGIC # 6️⃣ Passo 6b · Grants para o Service Principal do app
# MAGIC
# MAGIC Pré-requisito: o SP **`energia-app-sp`** criado no [Passo 6a](./README.md) — cole o **Client ID** no widget `sp_client_id`.
# MAGIC
# MAGIC | # | Camada | O que concede |
# MAGIC |---|---|---|
# MAGIC | 1 | Databricks | `CAN_USE` no projeto Lakebase → o SP pode **gerar token** do Postgres |
# MAGIC | 2 | Postgres | **role OAuth** do SP (usuário Postgres = client id) |
# MAGIC | 3 | Postgres | `GRANT energia_app` → escreve em `operacao`, lê `analitico` |

# COMMAND ----------

# MAGIC %pip install -U -q "databricks-sdk>=0.120" pg8000

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %run ../00_Setup/00_configuracao

# COMMAND ----------

import re

dbutils.widgets.text("sp_client_id", "", "👉 Client ID do Service Principal")
SP_ID = dbutils.widgets.get("sp_client_id").strip().lower()
if not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", SP_ID):
    raise ValueError("Informe no widget sp_client_id o Client ID (Application ID, formato UUID) do energia-app-sp")

sp = next(iter(w.service_principals.list(filter=f"applicationId eq '{SP_ID}'")), None)
print(f"👤 Service Principal: {sp.display_name if sp else '⚠️ não encontrado neste workspace'} ({SP_ID})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1 · `CAN_USE` no projeto Lakebase (Databricks)
# MAGIC `update` **adiciona** a permissão sem remover as existentes.

# COMMAND ----------

from databricks.sdk.service.iam import AccessControlRequest, PermissionLevel

w.permissions.update(
    request_object_type="database-projects",
    request_object_id=PROJETO,
    access_control_list=[AccessControlRequest(service_principal_name=SP_ID, permission_level=PermissionLevel.CAN_USE)],
)
for acl in w.permissions.get("database-projects", PROJETO).access_control_list:
    quem = acl.user_name or acl.group_name or acl.service_principal_name
    print(f"   {quem:45s} {[p.permission_level.value for p in acl.all_permissions]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2 · Role OAuth do SP no Postgres
# MAGIC `databricks_create_role` (extensão `databricks_auth`) resolve a identidade no workspace e cria a role com login via
# MAGIC token OAuth — equivalente a **Roles › Add role** na UI do projeto ou a `databricks postgres create-role` no CLI.

# COMMAND ----------

existe = executar_sql_lakebase("SELECT count(*) FROM pg_roles WHERE rolname = :r", r=SP_ID)[0][0]
if existe:
    print(f"ℹ️ role {SP_ID} já existe")
else:
    executar_sql_lakebase("SELECT databricks_create_role(:id, 'service_principal')", id=SP_ID)
    print(f"✅ role OAuth criada: {SP_ID}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3 · Privilégios: membro da role de aplicação `energia_app`

# COMMAND ----------

executar_sql_lakebase(f'GRANT energia_app TO "{SP_ID}"')
print(f'✅ GRANT energia_app TO "{SP_ID}"')

# COMMAND ----------

# MAGIC %md
# MAGIC ## ✅ Verificação — o que o SP consegue fazer

# COMMAND ----------

import pandas as pd

verificacao = executar_sql_lakebase("""
SELECT t.objeto, t.privilegio,
       CASE WHEN to_regclass(t.objeto) IS NULL THEN NULL
            ELSE has_table_privilege(:sp, t.objeto, t.privilegio) END AS permitido
FROM (VALUES ('operacao.ordens_servico', 'INSERT'), ('operacao.ordens_servico', 'UPDATE'),
             ('operacao.permissoes_trabalho', 'INSERT'), ('operacao.historico_status', 'INSERT'),
             ('analitico.saude_equipamentos', 'SELECT'), ('analitico.kpis_manutencao', 'SELECT'),
             ('analitico.equipamentos', 'SELECT')) AS t(objeto, privilegio)
""", sp=SP_ID)
display(pd.DataFrame(verificacao, columns=["objeto", "privilégio", "permitido"]))

for r in w.postgres.list_roles(parent=BRANCH_PROD):
    if r.status and r.status.postgres_role == SP_ID:
        print(f"🐘 role {r.status.postgres_role} · {r.status.identity_type.value} · {r.status.auth_method.value}")

# COMMAND ----------

# MAGIC %md
# MAGIC ✅ **Checkpoint:** tudo ✅ acima. Guarde o **Client ID** e o **Secret** — vão para o `app/.env` no
# MAGIC [**Passo 7**](../07_App_Local/README.md).
