# 5️⃣ Passo 5 (e) · Synced tables: o Lakehouse devolve inteligência para o Lakebase — pela UI

Uma **synced table** mantém uma cópia **somente leitura** de uma tabela Delta **dentro do Postgres** do Lakebase. Quem cuida
dela é um pipeline serverless: é reverse ETL sem código. O app lê essa cópia com SQL comum, com latência de milissegundos.

Pré-requisito: Passo 4 executado. As tabelas gold existem e têm **Change Data Feed** ligado.

| Origem (Delta, `gabriel_dev.lakebase_workshop`) | Nome da synced table | Chave primária | Sync mode |
|---|---|---|---|
| `equipamentos` | `cadastro_equipamentos` | `tag` | **Snapshot** (cópia completa a cada sync) |
| `gold_saude_equipamentos` | `saude_equipamentos` | `tag` | **Triggered** (incremental via CDF) |
| `gold_kpis_manutencao` | `kpis_manutencao` | `unidade`, `data_referencia` | **Triggered** |
| `gold_telemetria_diaria` | `telemetria_diaria` | `tag`, `data` | **Triggered** |

> **Continuous** (streaming, com latência de segundos) também existe: use quando o app precisa do dado analítico quase em tempo real.

⏱️ 10 min

---

## 5.1 · Criar as 4 synced tables
Para **cada linha** da tabela acima:
1. **Catalog Explorer** › `gabriel_dev` › `lakebase_workshop` › tabela de **origem**.
2. **Create** › **Synced table**.
3. **Table name**: o nome da synced table. Ela fica no mesmo catálogo e schema da origem, que é o padrão do diálogo.
4. **Database type**: **Lakebase Serverless (Autoscaling)** · **Project** `energia-workshop` · **Branch** `production` · **Database** `energia`.
5. **Sync mode** e **Primary key** conforme a tabela.
6. **Create**. A carga inicial começa sozinha; o status aparece na aba **Overview** (`Online`).

> 🐘 No Postgres, cada synced table vira `lakebase_workshop.<nome>` no database `energia`: o **schema Postgres tem o mesmo nome do
> schema UC**. É esse schema que o app lê (`PG_SCHEMA_ANALITICO` no `app/.env`, padrão `lakebase_workshop`).

## 5.2 · GRANT: a role do app pode ler as synced tables
As synced tables pertencem a uma role interna do Databricks (`databricks_writer_*`). Como em qualquer tabela Postgres, o app só
lê o que receber via `GRANT`. **SQL Editor do Lakebase** › database `energia` › cole e execute
[`5b_grant_synced_tables.sql`](./5b_grant_synced_tables.sql).

> Repita o GRANT sempre que **recriar** uma synced table. O job do Passo 8 já faz isso a cada volta.

## 5.3 · Conferir no Postgres
```sql
SELECT e.tag, e.nome, e.unidade, s.health_score, s.risco, s.principal_sinal
FROM lakebase_workshop.saude_equipamentos s
JOIN lakebase_workshop.cadastro_equipamentos e USING (tag)
ORDER BY s.health_score
LIMIT 8;
```

## 5.4 · Atualizar sob demanda
Na synced table › **Overview** › **Sync now**: para Triggered, sincroniza só o que mudou no gold.
O notebook [`05b_uma_volta_do_loop`](./05b_uma_volta_do_loop.py) (opcional) faz uma volta completa (pico de telemetria → gold → sync).
No **Passo 8** isso vira um job contínuo.

---

✅ **Checkpoint:** 4 synced tables `Online`, o GRANT aplicado e a consulta 5.3 retornando o `ATL-K-2101A` como 🔴 CRITICO.
💬 *"Reverse ETL sem código, governado no Unity Catalog."*

Próximo: [**Passo 6 — Service Principal e grants**](../06_Service_Principal_e_Grants/README.md)
