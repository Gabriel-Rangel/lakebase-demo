# 3️⃣ Passo 3 (c) · Registrar o Lakebase no Unity Catalog — pela UI

**O transacional passa a ser visível no Lakehouse — sem ETL, sem cópia.**
Registrar o database `energia` no Unity Catalog cria um catálogo que **espelha** o Postgres:

| | |
|---|---|
| 🔍 **Leitura federada** | as consultas leem o Postgres **ao vivo** — o dado não é copiado |
| 🛡️ **Governança** | `GRANT SELECT` / `USE CATALOG` do Unity Catalog, linhagem e auditoria |
| 🧩 **Integração** | o OLTP vira insumo para SQL, dashboards, Genie e notebooks, junto com o Delta |
| 🔒 **Somente leitura** | quem escreve continua sendo o app, via Postgres |

⏱️ 10 min

---

## 3.1 · Criar o catálogo
1. Menu lateral › **Catalog** (Catalog Explorer) › **+** › **Create a catalog**.
2. **Catalog name**: `energia_lakebase` (👉 **ALTERE** junto com o widget `catalogo_lakebase` do `00_configuracao`, se mudar).
3. **Type**: **Lakebase Postgres** › **Autoscaling**.
4. **Project** `energia-workshop` · **Branch** `production` · **Postgres database** `energia`.
5. **Create**.

## 3.2 · O OLTP no Catalog Explorer
Abra `energia_lakebase` › `operacao` › `ordens_servico`. As colunas e os **comentários** que o time de aplicação escreveu na
migração (`COMMENT ON TABLE …`, Passo 2) aparecem para o time de dados.

## 3.3 · Consulta ao vivo
**SQL Editor** do workspace, com um **SQL Warehouse serverless** (o Serverless Starter Warehouse serve):
```sql
SELECT numero, equipamento_tag, unidade, tipo, prioridade, status, titulo, data_abertura
FROM energia_lakebase.operacao.ordens_servico
ORDER BY data_abertura DESC
LIMIT 10;
```
> ⚠️ O catálogo do Lakebase é consultado por SQL Warehouse **serverless** ou por notebooks **serverless**. Warehouses Pro/Classic não acessam.

## 3.4 · Transacional ⨝ Analítico na mesma consulta
Execute o notebook [`03_consultas_federadas`](./03_consultas_federadas.py) em **serverless**. Ele junta:
- **backlog por FPSO**, direto do OLTP;
- **equipamentos degradando sem OS aberta**: telemetria Delta (~194 mil leituras) ⨝ OS do Lakebase;
- **tempo de aprovação das PTs**, a partir da trilha de auditoria.

## 3.5 · Governança
O acesso ao transacional pelo Lakehouse segue o modelo de permissões do Unity Catalog:
```sql
GRANT USE CATALOG ON CATALOG energia_lakebase TO `analistas-manutencao`;
GRANT USE SCHEMA, SELECT ON SCHEMA energia_lakebase.operacao TO `analistas-manutencao`;
```

---

✅ **Checkpoint:** `SELECT` em `energia_lakebase.operacao.ordens_servico` retorna as 300 OS.
💬 *"O transacional já está no Lakehouse — sem pipeline, sem cópia, com a governança do Unity Catalog."*

Próximo: [**Passo 4 — enriquecimento no Lakehouse**](../04_Enriquecimento_Lakehouse/04_camada_gold.py)
