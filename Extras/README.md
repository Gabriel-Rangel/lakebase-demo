# 🧪 Extras (opcionais) — pela UI

Pré-requisito: Passos 1 a 7 concluídos. O branch herda as roles, inclusive a do Service Principal, então crie-o **depois** do Passo 6.

---

## Extra 1 · Branching: teste uma migração de schema sem tocar em produção

**"Trate seu banco de dados como código."** Um branch do Lakebase é uma cópia **zero-copy** (copy-on-write):

| | |
|---|---|
| ⚡ **Instantâneo** | segundos, independente do tamanho do banco — não copia dados |
| 🧬 **Completo** | dados, schemas, roles (inclusive o Service Principal) e grants |
| 🧱 **Isolado** | compute próprio: carga e migrações no `dev` não afetam `production` |
| ⏳ **Efêmero** | expira sozinho |

**Cenário:** o time de Segurança pediu **bloqueios LOTO** (Lockout/Tagout) nas Permissões de Trabalho. A migração
[`003_bloqueios_loto.sql`](../app/backend/migrations/003_bloqueios_loto.sql) altera uma tabela com dados de produção,
então vamos validá-la num branch com dados reais.

```
production ──●────────────────●──────────▶   app :8080  (schema v2)
              \
 dev (1 dia)   ●── migração 003 ──●──▶      app :8081  (schema v3 · LOTO)
```

1. **Criar o branch:** Lakebase › projeto › **Branches** › **Create branch**
   - **Branch name** `dev`
   - **Branch data and schema** a partir de `production`
   - **Auto-delete** **After 1 day**
2. **Compute do branch:** branch `dev` › **Computes** › **Edit** › scale to zero após **1 minuto** (para o Extra 2) › **Save**.
3. **Host do branch:** branch `dev` › **Connect** › copie o host `ep-…`.
4. **App de dev ao lado do de produção** (pasta `app/`):
   ```bash
   cp .env .env.dev
   # no .env.dev, troque:  APP_AMBIENTE=dev · PGHOST=<host do dev>
   # e acrescente:         DB_POOL_MIN=0 · DB_POOL_MAX_IDLE=60
   APP_ENV_FILE=.env.dev FRONTEND_PORT=8081 MIGRATE_TARGET=3 docker compose -p energia-dev up -d --build
   ```
   O app descobre o endpoint do branch pelo `PGHOST`. O serviço `migrate` aplica a 003 **só no dev**.

   | | Produção — http://localhost:8080 | Dev — http://localhost:8081 |
   |---|---|---|
   | badge | 🟢 `branch: production` · `schema v2` | 🟠 `branch: dev` · `schema v3` |
   | PT | sem LOTO | seção **Bloqueios LOTO** + regra "sem cadeado não inicia" |

5. **Testar no dev:** solicite uma PT com **"Requer bloqueio LOTO"** e aprove com a persona Supervisor. Tente **Iniciar** sem cadeado
   (o app bloqueia ✋). Depois aplique um cadeado e inicie.
6. **Comparar:** SQL Editor, trocando o seletor de **branch**:
   `SELECT max(versao) FROM operacao.schema_migrations;` retorna 2 em `production` e 3 em `dev`.
7. **Promover e limpar:** aplique a mesma migração em produção com `MIGRATE_TARGET=3 docker compose run --rm migrate`, derrube o dev
   com `docker compose -p energia-dev down` e apague o branch (menu **⋮** do branch › **Delete**), ou deixe expirar.

> 💡 O catálogo `energia_lakebase` e as synced tables continuam ligados a **production**. No branch, as synced tables são uma foto do
> momento em que ele foi criado.
> 💡 **Restore / PITR:** **Create branch** › *Branch data and schema from a past point in time*, ou seja, um branch de "5 minutos atrás"
> para recuperar um `DELETE` acidental.

---

## Extra 2 · Scale-to-zero

Com o app de **dev** no ar (Extra 1):
1. No app de dev (`:8081`), **desligue** o switch *Auto 10s*. Sem polling, o pool fecha as conexões ociosas em 60 s
   (`DB_POOL_MIN=0`, `DB_POOL_MAX_IDLE=60`).
2. Lakebase › branch `dev` › **Computes**: depois de ~1 minuto sem conexões, o status fica **Suspended**, e o custo de compute vai a zero.
3. Recarregue o app de dev › página **Conexão Lakebase**. A primeira requisição **acorda** o compute: só ela tem latência maior, e o status volta para **Active**.
4. **Monitoring** › **Metrics** do branch `dev`: os períodos suspensos aparecem sem consumo.

💬 *"Dev e homologação dormem sozinhos — paga-se pelo que se usa."*
