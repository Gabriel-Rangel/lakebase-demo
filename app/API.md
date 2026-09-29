# 📡 Contrato da API — Brickhouse Energia (backend FastAPI)

Base: `/api` (o nginx do frontend faz proxy para `backend:8000`). Todas as datas em ISO-8601 (UTC). Erros seguem o padrão FastAPI: `{"detail": ...}`.

| Código | Quando |
|---|---|
| `404` | recurso não encontrado |
| `409` | conflito de concorrência (campo `version` desatualizado) **ou** regra de negócio que depende do estado atual (ex.: já existe PT ativa) — `detail = {"mensagem": str, "versao_atual": int \| null}` |
| `422` | transição de status inválida / validação — `detail = {"mensagem": str}` (ou o formato padrão do Pydantic) |
| `503` | Lakebase indisponível (compute acordando do scale-to-zero, rede) — `detail = {"mensagem": str}` |

---

## Tipos

```ts
type Papel = "TECNICO" | "SUPERVISOR" | "SEGURANCA" | "PLANEJADOR";
type Risco = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
type StatusOS = "ABERTA" | "PLANEJADA" | "AGUARDANDO_PT" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA";
type StatusPT = "SOLICITADA" | "APROVADA" | "REJEITADA" | "EM_EXECUCAO" | "ENCERRADA" | "CANCELADA";
type TipoOS = "CORRETIVA" | "PREVENTIVA" | "PREDITIVA";
type TipoPT = "TRABALHO_A_QUENTE" | "ESPACO_CONFINADO" | "ELETRICA" | "ALTURA" | "GERAL";
type Prioridade = "P1" | "P2" | "P3" | "P4";      // P1 = emergencial
type FonteAnalitica = "LAKEHOUSE_SYNCED" | "CSV_LOCAL";

interface Usuario { id: number; nome: string; email: string; papel: Papel; unidade: string | null; }

interface Equipamento {
  tag: string; nome: string; tipo: string; unidade: string; sistema: string;
  criticidade: "A" | "B" | "C"; fabricante: string; modelo: string;
  potencia_kw: number | null; data_instalacao: string | null;
  // vindos do Lakehouse (synced table) — null quando fonte = CSV_LOCAL
  health_score: number | null;        // 0–100 (100 = saudável)
  risco: Risco | null;
  prob_falha_30d: number | null;      // 0–1
  principal_sinal: string | null;     // ex.: "Vibração 38% acima da linha de base"
  recomendacao: string | null;
  atualizado_em: string | null;
  // vindo do OLTP (Lakebase)
  os_abertas: number;
}

interface OrdemResumo {
  id: number; numero: string; equipamento_tag: string; equipamento_nome: string | null; unidade: string;
  tipo: TipoOS; prioridade: Prioridade; status: StatusOS; origem: "MANUAL" | "PREDITIVA_LAKEHOUSE";
  titulo: string; solicitante_nome: string | null; responsavel_nome: string | null;
  data_abertura: string; data_prevista: string | null; data_conclusao: string | null;
  version: number; atualizado_em: string;
  pt_ativa: { id: number; numero: string; status: StatusPT; tipo: TipoPT } | null;
}

interface Ordem extends OrdemResumo {
  descricao: string | null; solicitante_id: number; responsavel_id: number | null;
  data_inicio: string | null; horas_indisponivel: number | null;
}

interface Permissao {
  id: number; numero: string; ordem_id: number; ordem_numero: string; ordem_titulo: string;
  equipamento_tag: string; unidade: string; tipo: TipoPT; status: StatusPT;
  riscos: string[]; medidas_controle: string | null; validade_horas: number;
  solicitante_id: number; solicitante_nome: string;
  aprovador_id: number | null; aprovador_nome: string | null; comentario_decisao: string | null;
  validade_inicio: string | null; validade_fim: string | null;
  criada_em: string; decidida_em: string | null; version: number;
  // somente quando schema_version >= 3 (migração do Extra 1 — LOTO)
  requer_loto?: boolean;
  bloqueios?: Bloqueio[];
}

interface Bloqueio {   // LOTO — Lockout/Tagout (schema_version >= 3)
  id: number; permissao_id: number; ponto_isolamento: string;
  tipo_energia: "ELETRICA" | "HIDRAULICA" | "PNEUMATICA" | "MECANICA" | "QUIMICA";
  cadeado_numero: string; aplicado_por_nome: string; aplicado_em: string; removido_em: string | null;
}

interface HistoricoItem {
  id: number; entidade: "OS" | "PT"; entidade_id: number; de_status: string | null; para_status: string;
  usuario_nome: string | null; comentario: string | null; criado_em: string;
}
```

---

## Saúde / metadados

| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/health` | `{"status": "ok"}` — **não toca no banco** (não acorda o compute) |
| GET | `/api/health/db` | `{"status": "ok", "latencia_ms": number}` |
| GET | `/api/meta` | `{"empresa": "Brickhouse Energia", "schema_version": number, "loto_habilitado": boolean, "branch": string \| null, "modo_auth": "oauth" \| "password" \| "profile", "ambiente": string}` |
| GET | `/api/conexao` | ver abaixo |

`GET /api/conexao`:
```ts
{
  rodando_em: "docker" | "host"; hostname: string;
  modo_auth: "oauth" | "password" | "profile"; usuario_pg: string;   // current_user
  host: string; porta: number; database: string;
  projeto: string | null; branch: string | null; endpoint: string | null;  // caminho projects/../branches/../endpoints/..
  versao_postgres: string; schema_version: number; latencia_ms: number;
  token: { expira_em: string | null; minutos_restantes: number | null; renovacoes: number } | null;  // null no modo password
  pool: { tamanho: number; disponiveis: number; em_espera: number; max: number; min: number;
          conexoes_criadas: number; erros: number };
  endpoint_info: { estado: string; min_cu: number; max_cu: number; suspend_timeout: string | null;
                   ultimo_ativo: string | null } | null;          // null se sem credencial Databricks
  tabelas: { schema: string; tabela: string; tipo: "OLTP" | "SYNCED"; dono: string; linhas_estimadas: number }[];
  privilegios_analitico_ok: boolean;   // o app consegue ler o schema "analitico" (synced tables)?
}
```

## Usuários

| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/usuarios` | `Usuario[]` |

## Equipamentos (cadastro + saúde vindos do Lakehouse)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/equipamentos?unidade=&risco=&busca=` | — | `{ fonte: FonteAnalitica; atualizado_em: string \| null; itens: Equipamento[] }` (ordenado por `health_score` asc, nulls last) |
| GET | `/api/equipamentos/{tag}` | — | `{ fonte; equipamento: Equipamento; tendencia: { data: string; vibracao_mm_s: number; temperatura_c: number; pressao_bar: number; corrente_a: number }[]; ordens: OrdemResumo[] }` |
| POST | `/api/equipamentos/{tag}/os-preditiva` | `{ solicitante_id: number }` | `Ordem` (201) — cria OS `PREDITIVA`, origem `PREDITIVA_LAKEHOUSE`, prioridade derivada do risco |

## Ordens de Serviço (OLTP no Lakebase)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/ordens?status=&unidade=&prioridade=&busca=&limite=50&offset=0` | — | `{ itens: OrdemResumo[]; total: number }` (mais recentes primeiro) |
| POST | `/api/ordens` | `{ equipamento_tag; tipo: TipoOS; prioridade: Prioridade; titulo; descricao?; solicitante_id; data_prevista? }` | `Ordem` (201) |
| GET | `/api/ordens/{id}` | — | `{ ordem: Ordem; historico: HistoricoItem[]; permissoes: Permissao[] }` |
| PATCH | `/api/ordens/{id}` | `{ version; usuario_id; titulo?; descricao?; prioridade?; responsavel_id?; data_prevista? }` | `Ordem` \| **409** |
| POST | `/api/ordens/{id}/transicao` | `{ para_status: StatusOS; usuario_id; version; comentario? }` | `Ordem` \| 409 \| 422 |

Transições permitidas via `/transicao`: `ABERTA→PLANEJADA`, `PLANEJADA→AGUARDANDO_PT`, qualquer não-final `→CANCELADA`.
`AGUARDANDO_PT→EM_EXECUCAO` e `EM_EXECUCAO→CONCLUIDA` acontecem **pela PT** (`iniciar` / `encerrar`).

## Permissões de Trabalho (PT)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/permissoes?status=&unidade=` | — | `{ itens: Permissao[] }` |
| POST | `/api/permissoes` | `{ ordem_id; tipo: TipoPT; riscos: string[]; medidas_controle?; validade_horas (1–24); solicitante_id; requer_loto? }` | `Permissao` (201). OS precisa estar `PLANEJADA` ou `AGUARDANDO_PT` (vai para `AGUARDANDO_PT`) |
| POST | `/api/permissoes/{id}/aprovar` | `{ usuario_id; version; comentario? }` | `Permissao` — aprovador precisa ser `SUPERVISOR`/`SEGURANCA` e ≠ solicitante (422); 1 PT ativa por OS (409) |
| POST | `/api/permissoes/{id}/rejeitar` | `{ usuario_id; version; comentario }` | `Permissao` |
| POST | `/api/permissoes/{id}/iniciar` | `{ usuario_id; version }` | `Permissao` — PT `APROVADA→EM_EXECUCAO` e OS `→EM_EXECUCAO` (mesma transação). Com LOTO: exige ≥1 bloqueio se `requer_loto` |
| POST | `/api/permissoes/{id}/encerrar` | `{ usuario_id; version; horas_indisponivel?; comentario? }` | `Permissao` — PT `→ENCERRADA` e OS `→CONCLUIDA` |
| POST | `/api/permissoes/{id}/bloqueios` | `{ usuario_id; ponto_isolamento; tipo_energia; cadeado_numero }` | `Bloqueio` (201) — só com `schema_version >= 3` (senão 404) |
| POST | `/api/permissoes/{id}/bloqueios/{bloqueio_id}/remover` | `{ usuario_id }` | `Bloqueio` |

## Painel

| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/painel/kpis` | ver abaixo |
| GET | `/api/painel/series?dias=30` | `{ os_por_dia: {data; abertas; concluidas}[]; os_por_status: {status; total}[]; os_por_unidade: {unidade; abertas; criticas}[] }` |

```ts
// GET /api/painel/kpis
{
  oltp: {                     // ao vivo, direto do Lakebase
    os_abertas: number; os_em_execucao: number; os_p1_abertas: number;
    pts_aguardando_aprovacao: number; pts_ativas: number; os_concluidas_7d: number;
    consultado_em: string;
  };
  lakehouse: {                // synced table gold_kpis_manutencao (null antes do Passo 5)
    fonte: FonteAnalitica; atualizado_em: string | null;
    por_unidade: { unidade: string; data_referencia: string; disponibilidade_pct: number;
                   mttr_horas: number | null; backlog_os: number; equipamentos_risco_alto: number;
                   health_score_medio: number | null }[];
  } | null;
  equipamentos_risco: { tag: string; nome: string; unidade: string; health_score: number | null;
                        risco: Risco | null; principal_sinal: string | null }[];   // top 5 piores
}
```
