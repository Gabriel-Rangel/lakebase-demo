#!/usr/bin/env bash
# Derruba os containers do workshop (produção, dev e "antes" com Postgres local) e remove as imagens.
set -euo pipefail
cd "$(dirname "$0")/../app"
for projeto in energia energia-dev energia-local; do
  docker compose -p "$projeto" --profile local down --remove-orphans 2>/dev/null || true
done
docker image rm brickhouse-energia-backend:latest brickhouse-energia-frontend:latest 2>/dev/null || true
echo "✅ containers e imagens do workshop removidos (app/.env foi mantido)"
