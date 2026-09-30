# 7️⃣ Passo 7 · Build do app local e exploração

O app da Brickhouse Energia sobe **exatamente como vocês sobem as aplicações hoje** — `docker compose up` —, mas o banco é o **Lakebase**.
Repare no [`app/docker-compose.yml`](../app/docker-compose.yml): **não existe serviço `postgres`**.

```
┌──────────── seu servidor (Docker) ─────────────┐                 ┌──────────── Databricks ────────────┐
│ frontend (nginx :8080) ─► backend (FastAPI) ───┼── Postgres ────►│ Lakebase · energia-workshop        │
│                          migrate (1x)          │   TLS · OAuth   │  operacao.*  (escrito pelo app)    │
└────────────────────────────────────────────────┘   (SP Passo 6)  │  lakebase_workshop.* (synced)      │
                                                                    └────────────────────────────────────┘
```
⏱️ 20 min · terminal, a partir da raiz do repositório · pré-requisitos: Docker Engine + Compose (Mac: `colima start`), VPN.

---

## 7.1 · Configurar o `app/.env`
```bash
cp app/.env.example app/.env
```
Preencha (👉 **ALTERE**):

| Variável | Valor | Onde encontrar |
|---|---|---|
| `DATABRICKS_HOST` | `https://adb-….azuredatabricks.net` | URL do **workspace** — ⚠️ não a URL de login/SSO do navegador (ex.: `oneenv…`). Confira com `databricks auth profiles` ou o `host` em `~/.databrickscfg` |
| `DATABRICKS_CLIENT_ID` | UUID | Passo 6a (Client ID do `energia-app-sp`) |
| `DATABRICKS_CLIENT_SECRET` | secret | Passo 6a (aparece uma vez) |
| `PGHOST` | `ep-….database.<região>.azuredatabricks.net` | Passo 1.3 — branch `production` › **Connect** |
| `PG_SCHEMA_ANALITICO` | `lakebase_workshop` | já preenchido — schema das synced tables (Passo 5) |
| `LAKEBASE_ENDPOINT` | *(vazio)* | opcional — o app descobre o endpoint pelo `PGHOST` |
| `PIP_INDEX_URL` | proxy PyPI da Databricks | já preenchido (VPN). Fora da VPN, apague a linha |

> 🔐 No modo `oauth` **não existe senha de banco** no `.env` — só a identidade do app. O backend gera o token do Lakebase (1 h) e o renova sozinho.
>
> ⚠️ Preencha **somente o `app/.env`** (ignorado pelo git). Nunca coloque valores reais no `.env.example` — ele é versionado.

Checagem de rede (443 para o workspace, 5432 para o Lakebase):
```bash
./scripts/checar_conectividade.sh
```

## 7.2 · Build
```bash
cd app
docker compose build
```
| Imagem | Como é construída |
|---|---|
| `brickhouse-energia-backend` | `python:3.12-slim` + FastAPI + psycopg 3 (pool) + databricks-sdk |
| `brickhouse-energia-frontend` | build do React (Vite) em `node:20` → arquivos estáticos servidos pelo `nginx`, que faz proxy de `/api` |

## 7.3 · Subir
```bash
docker compose up -d
docker compose ps                 # migrate: exited (0) · backend: healthy · frontend: running
docker compose logs migrate       # "conectado como <client-id do SP>" · ✔ 001 e 002 "já aplicadas" (Passo 2 usou as MESMAS migrações)
```
Abra **http://localhost:8080**. ✅ Header: `branch: production` · `OAuth M2M` · `schema v2`.

---

## 7.4 · Explorar a aplicação (roteiro de 10 min)

| # | Tela | O que mostrar | Mensagem |
|---|---|---|---|
| 1 | **Conexão Lakebase** | container → host `ep-…`, usuário Postgres = **client id do SP**, token expirando em ~60 min, pool, latência, compute 0,5–4 CU; tabelas `operacao` (OLTP) × `analitico` (synced) | *"Roda no nosso Docker, fala Postgres com o Lakebase, sem senha de banco."* |
| 2 | **Painel** | cards **ao vivo** do OLTP × indicadores do **Lakehouse** (disponibilidade, MTTR, backlog por FPSO) | *"Transacional e analítico na mesma tela, na mesma plataforma."* |
| 3 | **Equipamentos** › `ATL-K-2101A` | health score 🔴, vibração +116% (tendência de 30 dias), recomendação | *"Esse insight nasceu no Lakehouse e chegou aqui por synced table."* |
| 4 | ⤷ **Criar OS preditiva** | 1 clique grava a OS no Lakebase (origem `PREDITIVA_LAKEHOUSE`) | *"Insight vira ação no transacional."* |
| 5 | **Ordens de Serviço** | abra a mesma OS em **duas abas**, salve nas duas → **409** | *"Lock otimista: ninguém sobrescreve o trabalho do outro."* |
| 6 | **Permissões de Trabalho** | solicite uma PT (persona Técnico), troque para **Supervisor** e aprove; tente aprovar com quem solicitou → recusado | *"Segregação de funções garantida por constraint no banco."* |
| 7 | **SQL Editor** (workspace) | `SELECT * FROM energia_lakebase.operacao.ordens_servico ORDER BY data_abertura DESC LIMIT 5` | *"A OS que acabei de criar já está no Unity Catalog — sem ETL."* |

## 7.5 · (Opcional) "Vocês só trocam a connection string"
Com a role `app_energia` criada no Passo 6 (opcional — **Add role › Password**, senha gerada pela UI), preencha
`PGUSER=app_energia` / `PGPASSWORD=<senha gerada>` no `.env` e:
```bash
sed -i.bak 's/^LAKEBASE_AUTH_MODE=oauth/LAKEBASE_AUTH_MODE=password/' .env && docker compose up -d
docker compose run --rm psql -c "SELECT current_user, count(*) FROM operacao.ordens_servico"
```
Página **Conexão**: modo **Senha nativa**. Volte com `mv .env.bak .env && docker compose up -d`.

> **Antes × depois:** o mesmo app contra um Postgres em container (o cenário de hoje):
> `cp .env.local.example .env.local && APP_ENV_FILE=.env.local docker compose -p energia-local --profile local up -d --build`
> — a única diferença entre os dois mundos é o `.env`. (`docker compose -p energia-local --profile local down` para sair.)

## Por dentro do código
| Arquivo | O que olhar |
|---|---|
| [`app/backend/app/db.py`](../app/backend/app/db.py) | `LakebaseConnection.connect()` injeta o token OAuth como senha; pool recicla conexões a cada 45 min; leituras em autocommit (1 round-trip) |
| [`app/backend/app/services/ordens.py`](../app/backend/app/services/ordens.py) | `SELECT … FOR UPDATE`, `version`, histórico gravado na mesma transação |
| [`app/backend/app/services/equipamentos.py`](../app/backend/app/services/equipamentos.py) | lê as synced tables (`PG_SCHEMA_ANALITICO`) — antes do Passo 5, cai para o CSV |
| [`app/API.md`](../app/API.md) | contrato da API |

✅ **Checkpoint:** app no ar em http://localhost:8080 com dados do Lakebase e do Lakehouse.
Próximo: [**Passo 8 — simulação contínua**](../08_Simulacao_Continua/08a_simulador_operacao.py).
