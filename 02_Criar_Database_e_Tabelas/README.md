# 2️⃣ Passo 2 (b) · Criar o database, as roles e as tabelas — pela UI

Lakebase **é Postgres**: database, roles, `GRANT`, schemas, constraints e extensões funcionam como o time já conhece.
Tudo neste passo é feito na UI do projeto: aba **Roles & Databases** e **SQL Editor**.

```
database energia
├── schema operacao           ← OLTP do app (OS, PT, histórico) — dono: role energia_app
└── schema lakebase_workshop  ← criado no Passo 5 pelas synced tables (Lakehouse → Lakebase), somente leitura

energia_app (NOLOGIN)  ← "role de aplicação": dona dos objetos; quem usa o app vira MEMBRO dela
├── <você>                              (agora)
└── <client id do Service Principal>    (Passo 6)
```

⏱️ 10 min

---

## 2.1 · Database `energia`
Projeto › branch **production** › aba **Roles & Databases** › **Add database**:
- **Database name**: `energia`
- **Owner role**: a sua (o seu e-mail)

## 2.2 · Roles e schema
Menu lateral › **SQL Editor** › branch `production` › database **`energia`**. Cole o conteúdo de
[`2b_roles_e_schema.sql`](./2b_roles_e_schema.sql) e clique em **Run**.

Não precisa editar nada: o script usa `current_user`. A última consulta mostra `energia_app`, com você como membro.

## 2.3 · Tabelas (as mesmas migrações do app)
No mesmo SQL Editor (database `energia`), cole e execute, **nesta ordem**:
1. [`app/backend/migrations/001_schema_oltp.sql`](../app/backend/migrations/001_schema_oltp.sql): tabelas, `CHECK`, `UNIQUE` parcial e FKs.
2. [`app/backend/migrations/002_indices_e_comentarios.sql`](../app/backend/migrations/002_indices_e_comentarios.sql): índices e comentários. Os comentários aparecem no Unity Catalog no Passo 3.

As regras críticas de negócio ficam **no banco**, e nenhum cliente consegue burlá-las:

| Regra | Como |
|---|---|
| quem solicita a PT não pode aprová-la | `CHECK (aprovador_id <> solicitante_id)` |
| no máximo 1 PT ativa por OS | índice `UNIQUE` parcial `WHERE status IN ('APROVADA','EM_EXECUCAO')` |
| duas pessoas editando a mesma OS | coluna `version` (lock otimista) |
| status válidos | `CHECK (status IN (...))` |

> 💡 São **os mesmos arquivos** que o serviço `migrate` do app aplica no Docker (Passo 7). Eles são idempotentes e se
> registram em `operacao.schema_migrations`, então no Passo 7 o `migrate` só confirma: *"já aplicada"*. É schema versionado como código.

## 2.4 · Dados de demonstração (~90 dias de operação)
Ainda no SQL Editor (database `energia`), cole e execute [`app/backend/sql/seed_demo.sql`](../app/backend/sql/seed_demo.sql).
Ele cria 12 pessoas, 300 OS, as PTs e a trilha de auditoria, **em SQL puro** (`generate_series` + `random()`).
É idempotente: se já houver OS, nada é recriado.

Confira:
```sql
SELECT status, count(*) FROM operacao.ordens_servico GROUP BY 1 ORDER BY 2 DESC;

SELECT c.relname AS tabela, pg_get_userbyid(c.relowner) AS dono
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'operacao' AND c.relkind = 'r' ORDER BY 1;     -- todas com dono energia_app
```

---

✅ **Checkpoint:** 300 OS em `operacao.ordens_servico`, e todas as tabelas com dono `energia_app`.
💬 *"É Postgres de verdade: o que o time já sabe continua valendo — e as regras vivem no banco."*

Próximo: [**Passo 3 — registrar no Unity Catalog**](../03_Registrar_no_Unity_Catalog/README.md)
