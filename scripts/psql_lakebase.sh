#!/usr/bin/env bash
# Abre um psql no Lakebase como VOCÊ (OAuth do Databricks CLI) — sem instalar psql (usa a imagem postgres:17-alpine).
#   ./scripts/psql_lakebase.sh <perfil> [endpoint] [database]
set -euo pipefail
PERFIL="${1:-DEFAULT}"
ENDPOINT="${2:-projects/energia-workshop/branches/production/endpoints/primary}"
DATABASE="${3:-energia}"
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
HOST=$(databricks postgres get-endpoint "$ENDPOINT" -p "$PERFIL" -o json | json "d['status']['hosts']['host']")
EU=$(databricks current-user me -p "$PERFIL" -o json | json "d['userName']")
PGPASSWORD=$(databricks postgres generate-database-credential "$ENDPOINT" -p "$PERFIL" -o json | json "d['token']")
export PGPASSWORD
echo "🐘 $EU @ $HOST/$DATABASE (token OAuth válido por 1h)"
exec docker run --rm -it -e PGPASSWORD postgres:17-alpine psql "host=$HOST port=5432 dbname=$DATABASE user=$EU sslmode=require"
