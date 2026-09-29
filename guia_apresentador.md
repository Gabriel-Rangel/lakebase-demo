# 🎤 Guia do apresentador — Lakebase para Óleo & Gás

> Público: times de aplicação e de dados de uma operadora de O&G que hoje roda **tudo em Docker com Postgres**.
> Mensagem central: **"um único ecossistema para o transacional e o analítico"** — sem mudar o jeito como vocês constroem apps.

---

## 1. Checklist da véspera (D-1)

| ✔ | Item | Como |
|---|---|---|
| ☐ | VPN Databricks ligada | proxies de PyPI/npm usados no build |
| ☐ | Docker rodando | `colima start --cpu 4 --memory 6` · `docker info` |
| ☐ | Notebooks e jobs publicados | `databricks bundle deploy -p <perfil>` |
| ☐ | Imagens construídas com antecedência | `cp app/.env.example app/.env` (já traz o proxy de PyPI da VPN) e `cd app && docker compose build` |
| ☐ | Decidir: **ao vivo do zero** ou **pré-provisionado** | do zero: rode `99_Cleanup` antes · pré-provisionado: job `(atalho) Passos 0 → 5` |
| ☐ | Service Principal criado e secret no `app/.env` | Passo 6 (o secret aparece uma vez — tenha-o à mão) |
| ☐ | Rede no local da apresentação: 443 e **5432** | `./scripts/checar_conectividade.sh` — plano B: hotspot |
| ☐ | Abas abertas | app `:8080` · projeto Lakebase (aba Monitoring) · SQL Editor · Jobs (Passos 8 e 9) · Catalog Explorer |
| ☐ | Não mexer nos limites de CU durante a demo | alterar min/max reinicia o compute por alguns segundos |

---

## 2. Roteiro — passo ⟶ slide do deck ⟶ mensagem

| Passo | Slides | O que mostrar | Frase-chave |
|---|---|---|---|
| **0** | 2–9 (apps evoluíram, bancos não) | `app/docker-compose.yml`: **não há serviço `postgres`**; telemetria e cadastro já no Lakehouse | *"O compose de vocês continua igual — só o banco sai de dentro dele."* |
| **1 (a)** | 10–13, 16–17 | projeto criado em segundos: Postgres 17, 0,5–4 CU, scale-to-zero, storage separado do compute | *"Postgres gerenciado, serverless — sem VM, sem patch, sem backup para administrar."* |
| **2 (b)** | 14–15 (por que Postgres) | database, roles, `CHECK`/`UNIQUE` parcial/`version`, seed em SQL puro — tudo no SQL Editor | *"É Postgres de verdade: o que o time já sabe continua valendo."* |
| **3 (c)** | 23 (zero ETL), 37 (formas de conexão) | catálogo `energia_lakebase` no Catalog Explorer; `SELECT` no SQL Editor; JOIN com a telemetria Delta | *"O transacional está no Lakehouse — sem pipeline, sem cópia, com a governança do UC."* |
| **4 (d)** | 24 (casos de uso analíticos) | health score e KPIs; `ATL-K-2101A` crítico | *"Inteligência gerada juntando o que o app grava com o que os sensores medem."* |
| **5 (e)** | 24 (servir dados do Lakehouse), 27/29 | 4 synced tables `ONLINE`; `SELECT` no Postgres já traz o risco | *"Reverse ETL sem código: o Lakehouse devolve inteligência para o app."* |
| **6 (f, e′)** | 33–35 (segurança) | SP + secret; `CAN_USE`; `databricks_create_role`; `GRANT energia_app` | *"O app não tem senha de banco: tem uma identidade do workspace, governada e auditável."* |
| **7 (g)** | 5 (apps stateless) | `.env` com client id/secret + host; `docker compose build && up` | *"Mesmo fluxo de deploy de hoje."* |
| **7 (h)** | 24/26 (workflow, aprovação) | Conexão Lakebase → Painel → equipamento crítico → **Criar OS preditiva** → 409 em duas abas → PT com segregação de funções → OS no SQL Editor | *"Transacional crítico, regras no banco — e o insight vira ação em um clique."* |
| **8 (i)** | 23, 24 | ▶ job: OS chegando no Painel e no kanban; a cada volta, backlog/MTTR/risco mudam | *"O loop transacional ⇄ analítico, contínuo, numa plataforma só."* |
| **9 (j)** | 17–18, 21–22 (autoscaling, observabilidade) | ▶ job: Monitoring (CPU/RAM subindo), latência estável no app, `pg_stat_statements` | *"Escala com a carga; dev e homologação dormem sozinhos (scale-to-zero)."* |
| Extras | 19–20 (branching, restore) | branch `dev` + migração LOTO lado a lado; restore = branch de um instante no passado | *"Git para dados: migrações testadas com dados reais, sem risco."* |

---

## 3. Versão curta (30 min, com Passos 0 → 6 pré-provisionados)

1. **(3 min)** `docker-compose.yml` sem Postgres + projeto Lakebase na UI (endpoint, CU, scale-to-zero).
2. **(5 min)** Passo 7: `docker compose up` → página **Conexão** → Painel.
3. **(7 min)** Equipamento crítico → **Criar OS preditiva** → OS no SQL Editor via `energia_lakebase` → PT com segregação de funções.
4. **(8 min)** ▶ Passo 8 — enquanto roda, explique Unity Catalog + synced tables; mostre o Painel mudando.
5. **(5 min)** ▶ Passo 9 — aba **Monitoring** + latência no app.
6. **(2 min)** Recap com o diagrama do README.

---

## 4. Perguntas prováveis

| Pergunta | Resposta curta |
|---|---|
| Latência do app on-prem até a nuvem? | ~1 round-trip por consulta (leituras em autocommit). Use a região mais próxima (ex.: **Brazil South**); conexões ficam no pool e o token é renovado sem reconectar em massa. |
| O que abrir no firewall? | Saída TCP **5432** para `*.database.<região>.azuredatabricks.net` e **443** para o workspace. Private Link disponível. |
| E o Postgres que já temos? | `pg_dump`/`pg_restore` ou replicação lógica para o Lakebase; o app só troca o `.env`. |
| Quem administra usuários do banco? | Identidades do workspace (usuários, grupos, SPs) viram roles OAuth; roles nativas com senha continuam possíveis. |
| O app pode escrever nas synced tables? | Não — são somente leitura (dono: o pipeline). O app escreve em `operacao`. |
| Quão "tempo real" é o loop? | TRIGGERED: a cada volta (~2–3 min neste roteiro). **CONTINUOUS**: segundos, com o pipeline sempre ligado. |
| Quanto custa? | Compute por CU-hora (scale-to-zero zera o ocioso), storage por GB-mês, sync por DBU serverless. As tags do projeto aparecem em `system.billing.usage`. |

---

## 5. Reset rápido entre sessões
```bash
cd app && docker compose run --rm seed --reset      # OLTP limpo (usuários + 90 dias de histórico)
# Jobs: cancele os runs dos Passos 8/9 · rode "Passo 8" por 2–3 min para o gold/synced ficarem coerentes com o OLTP
```
Recomeçar do zero no workspace: [`99_Cleanup/99_limpeza`](99_Cleanup/99_limpeza.py) com `confirmar = sim`.
