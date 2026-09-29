#!/usr/bin/env bash
# =============================================================================
# Atalho OPCIONAL do Passo 6 (6a + 6b) — o passo a passo manual está em 06_Service_Principal_e_Grants/
#   1. cria o Service Principal "energia-app-sp" (ou reaproveita)
#   2. gera um secret OAuth (M2M) para ele
#   3. dá CAN_USE no projeto Lakebase
#   4. cria a role Postgres OAuth do SP (databricks_create_role)
#   5. GRANT energia_app ao SP + define a senha da role nativa app_energia
#   6. escreve app/.env (o secret aparece UMA vez e vai direto para o arquivo)
#
# Pré-requisitos: Databricks CLI autenticado (perfil com permissão de admin do workspace),
#                 Docker (usamos a imagem postgres:17-alpine como cliente psql) e python3.
#
# Uso:  ./scripts/criar_service_principal.sh <perfil-cli>
#       PROJETO=energia-workshop-fulano ./scripts/criar_service_principal.sh meu-perfil
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PERFIL="${1:-${DATABRICKS_CONFIG_PROFILE:-DEFAULT}}"
PROJETO="${PROJETO:-energia-workshop}"
BRANCH="${BRANCH:-production}"
DATABASE="${DATABASE:-energia}"
SP_NOME="${SP_NOME:-energia-app-sp}"
ENV_FILE="${ENV_FILE:-app/.env}"
ENDPOINT="projects/$PROJETO/branches/$BRANCH/endpoints/primary"

dbx() { databricks "$@" -p "$PERFIL"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

HOST="${DATABRICKS_HOST:-$(awk -v p="[$PERFIL]" '$0==p{f=1;next} /^\[/{f=0} f && $1=="host"{print $3; exit}' ~/.databrickscfg)}"
[ -n "$HOST" ] || { echo "❌ host do workspace não encontrado para o perfil $PERFIL (defina DATABRICKS_HOST)"; exit 1; }

echo "🏭 Workspace ..... $HOST (perfil $PERFIL)"
echo "🐘 Endpoint ...... $ENDPOINT"
PGHOST=$(dbx postgres get-endpoint "$ENDPOINT" -o json | json "d['status']['hosts']['host']")
EU=$(dbx current-user me -o json | json "d['userName']")
echo "   host .......... $PGHOST"

echo "1/6 👤 Service Principal '$SP_NOME'"
SP_JSON=$(dbx service-principals list --filter "displayName eq '$SP_NOME'" -o json)
SP_ID=$(echo "$SP_JSON" | json "d[0]['id'] if d else ''")
if [ -z "$SP_ID" ]; then
  SP_JSON=$(dbx service-principals create --display-name "$SP_NOME" -o json)
  SP_ID=$(echo "$SP_JSON" | json "d['id']")
  APP_ID=$(echo "$SP_JSON" | json "d['applicationId']")
  echo "    ✅ criado (application id $APP_ID)"
else
  APP_ID=$(echo "$SP_JSON" | json "d[0]['applicationId']")
  echo "    ℹ️ já existia (application id $APP_ID)"
fi

echo "2/6 🔑 Secret OAuth (M2M)"
SECRET=$(dbx service-principal-secrets-proxy create "$SP_ID" -o json | json "d['secret']")

echo "3/6 🛂 CAN_USE no projeto $PROJETO"
dbx permissions update database-projects "$PROJETO" --json \
  "{\"access_control_list\":[{\"service_principal_name\":\"$APP_ID\",\"permission_level\":\"CAN_USE\"}]}" >/dev/null

echo "4-5/6 🐘 Role OAuth do SP, GRANT energia_app e senha da role nativa app_energia"
SENHA=$(python3 -c "import secrets,string; a=string.ascii_letters+string.digits; print(''.join(secrets.choice(a) for _ in range(32)))")
PGPASSWORD=$(dbx postgres generate-database-credential "$ENDPOINT" -o json | json "d['token']")
export PGPASSWORD
docker run --rm -i -e PGPASSWORD postgres:17-alpine \
  psql "host=$PGHOST port=5432 dbname=$DATABASE user=$EU sslmode=require" -v ON_ERROR_STOP=1 -q <<SQL
SELECT databricks_create_role('$APP_ID', 'service_principal')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$APP_ID');
GRANT energia_app TO "$APP_ID";
ALTER ROLE app_energia WITH LOGIN PASSWORD '$SENHA';
SQL
unset PGPASSWORD

echo "6/6 📝 Gerando $ENV_FILE"
[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cat > "$ENV_FILE" <<EOF
# Gerado por scripts/criar_service_principal.sh em $(date '+%Y-%m-%d %H:%M')
# ⚠️ Contém segredos — não versionar (já está no .gitignore)
APP_AMBIENTE=produção

# ---- Lakebase ---------------------------------------------------------------
LAKEBASE_AUTH_MODE=oauth                 # oauth (Service Principal) | password (role nativa)
LAKEBASE_ENDPOINT=$ENDPOINT
PGHOST=$PGHOST
PGPORT=5432
PGDATABASE=$DATABASE
PGSSLMODE=require

# ---- Modo oauth: OAuth M2M do Service Principal "$SP_NOME" --------------------
DATABRICKS_HOST=$HOST
DATABRICKS_CLIENT_ID=$APP_ID
DATABRICKS_CLIENT_SECRET=$SECRET
DATABRICKS_AUTH_TYPE=oauth-m2m

# ---- Modo password: role Postgres nativa (usada quando LAKEBASE_AUTH_MODE=password)
PGUSER=app_energia
PGPASSWORD=$SENHA
EOF
chmod 600 "$ENV_FILE"

echo ""
echo "✅ Pronto! Próximos passos:"
echo "   cd app && docker compose up --build"
echo "   abra http://localhost:8080"
