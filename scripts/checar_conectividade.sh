#!/usr/bin/env bash
# Checagem de rede ANTES da demo/workshop: o servidor alcança o workspace (443) e o Lakebase (5432)?
#   ./scripts/checar_conectividade.sh            # lê DATABRICKS_HOST e PGHOST de app/.env
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f app/.env ] && set -a && . app/.env && set +a
ok=0
echo "🌐 Workspace ${DATABRICKS_HOST:-<DATABRICKS_HOST não definido>}"
if curl -s -o /dev/null -m 10 -w "   HTTPS %{http_code}\n" "${DATABRICKS_HOST:-https://invalid}"; then :; else echo "   ❌ sem acesso HTTPS ao workspace"; ok=1; fi
echo "🐘 Lakebase ${PGHOST:-<PGHOST não definido>}:5432"
if docker run --rm postgres:17-alpine pg_isready -h "${PGHOST:-invalid}" -p 5432 -t 10 >/dev/null 2>&1; then
  echo "   ✅ porta 5432 acessível (Postgres respondendo)"
else
  echo "   ❌ porta 5432 bloqueada ou host inválido — libere saída TCP 5432 para *.database.<região>.azuredatabricks.net"; ok=1
fi
exit $ok
