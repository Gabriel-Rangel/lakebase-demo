# 1️⃣ Passo 1 (a) · Criar o projeto Lakebase — pela UI

**Objetivo:** criar o banco transacional da *Brickhouse Energia*: Postgres 17 gerenciado e serverless. Sem VM, sem patch,
sem `docker run postgres`.

```
Projeto  energia-workshop            ← unidade de governança e custo
└─ Branch  production                ← "git para dados": branches são cópias zero-copy
   ├─ Compute primário (read-write)  ← autoscaling 0,5 → 4 CU e scale-to-zero
   └─ Database databricks_postgres   ← criado automaticamente (o nosso, "energia", vem no Passo 2)
```

| Conceito | O que significa |
|---|---|
| **Separação compute/storage** | o storage é gerenciado (multi-AZ); o compute liga, cresce e desliga sozinho |
| **CU** (Compute Unit) | 1 CU ≈ 2 GiB de RAM; o compute escala entre o mínimo e o máximo conforme a carga |
| **Scale-to-zero** | sem conexões pelo tempo configurado, o compute suspende e para de cobrar |

⏱️ 5 min

---

## 1.1 · Criar o projeto
1. No **seletor de apps** (canto superior direito do workspace), abra **Lakebase Postgres**.
2. Aba **Autoscaling** › **New project**.
3. **Project name**: `energia-workshop` (👉 **ALTERE** se várias pessoas usarem o mesmo workspace, ex.: `energia-workshop-ana`).
4. **Postgres version**: **17**. A região é a do workspace.
5. **Create**. Em poucos instantes o projeto fica pronto, com o branch **`production`**, o database `databricks_postgres` e um compute primário.

## 1.2 · ⚠️ Ajustar o compute (obrigatório — custo)
O compute inicial nasce **grande (8–16 CU)**. Para a demo:
1. No projeto › branch **production** › aba **Computes** › **Edit** no compute primário.
2. **Autoscaling**: mínimo **0,5 CU**, máximo **4 CU**.
3. **Scale to zero**: ligado, suspender após **1 hora** sem uso.
4. **Save**. O compute reinicia por alguns segundos.

## 1.3 · Host de conexão
No branch **production**, clique em **Connect**:
- escolha o database e a role (sua identidade OAuth);
- a *connection string* mostra o **host** `ep-….database.<região>.azuredatabricks.net`.

👉 **Anote o host**: ele é o `PGHOST` do app no Passo 7. O botão **Copy OAuth Token** gera um token de 1 h para `psql`, DBeaver ou pgAdmin.

## 1.4 · Primeira consulta: é Postgres puro
Menu lateral do projeto › **SQL Editor** › branch `production`, database `databricks_postgres`:
```sql
SELECT current_user, version();
```
**Run**. O usuário é **você**: a identidade do workspace vira role Postgres com login OAuth, sem senha estática.

---

✅ **Checkpoint:** projeto `energia-workshop` com o compute **Active** e autoscaling **0,5–4 CU**.
💬 *"Postgres gerenciado, serverless — sem VM, sem patch, sem backup para administrar."*

Próximo: [**Passo 2 — database e tabelas**](../02_Criar_Database_e_Tabelas/README.md)
