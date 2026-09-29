// Tipos espelhando app/API.md — manter em sincronia com o backend FastAPI.

export type Papel = "TECNICO" | "SUPERVISOR" | "SEGURANCA" | "PLANEJADOR";
export type Risco = "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
export type StatusOS =
  | "ABERTA"
  | "PLANEJADA"
  | "AGUARDANDO_PT"
  | "EM_EXECUCAO"
  | "CONCLUIDA"
  | "CANCELADA";
export type StatusPT =
  | "SOLICITADA"
  | "APROVADA"
  | "REJEITADA"
  | "EM_EXECUCAO"
  | "ENCERRADA"
  | "CANCELADA";
export type TipoOS = "CORRETIVA" | "PREVENTIVA" | "PREDITIVA";
export type TipoPT = "TRABALHO_A_QUENTE" | "ESPACO_CONFINADO" | "ELETRICA" | "ALTURA" | "GERAL";
export type Prioridade = "P1" | "P2" | "P3" | "P4";
export type FonteAnalitica = "LAKEHOUSE_SYNCED" | "CSV_LOCAL";
export type ModoAuth = "oauth" | "password" | "profile";
export type Criticidade = "A" | "B" | "C";
export type OrigemOS = "MANUAL" | "PREDITIVA_LAKEHOUSE";
export type TipoEnergia = "ELETRICA" | "HIDRAULICA" | "PNEUMATICA" | "MECANICA" | "QUIMICA";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  unidade: string | null;
}

export interface Equipamento {
  tag: string;
  nome: string;
  tipo: string;
  unidade: string;
  sistema: string;
  criticidade: Criticidade;
  fabricante: string;
  modelo: string;
  potencia_kw: number | null;
  data_instalacao: string | null;
  // Lakehouse (synced table) — null quando fonte = CSV_LOCAL
  health_score: number | null;
  risco: Risco | null;
  prob_falha_30d: number | null;
  principal_sinal: string | null;
  recomendacao: string | null;
  atualizado_em: string | null;
  // OLTP (Lakebase)
  os_abertas: number;
}

export interface PtAtivaResumo {
  id: number;
  numero: string;
  status: StatusPT;
  tipo: TipoPT;
}

export interface OrdemResumo {
  id: number;
  numero: string;
  equipamento_tag: string;
  equipamento_nome: string | null;
  unidade: string;
  tipo: TipoOS;
  prioridade: Prioridade;
  status: StatusOS;
  origem: OrigemOS;
  titulo: string;
  solicitante_nome: string | null;
  responsavel_nome: string | null;
  data_abertura: string;
  data_prevista: string | null;
  data_conclusao: string | null;
  version: number;
  atualizado_em: string;
  pt_ativa: PtAtivaResumo | null;
}

export interface Ordem extends OrdemResumo {
  descricao: string | null;
  solicitante_id: number;
  responsavel_id: number | null;
  data_inicio: string | null;
  horas_indisponivel: number | null;
}

export interface Bloqueio {
  id: number;
  permissao_id: number;
  ponto_isolamento: string;
  tipo_energia: TipoEnergia;
  cadeado_numero: string;
  aplicado_por_nome: string;
  aplicado_em: string;
  removido_em: string | null;
}

export interface Permissao {
  id: number;
  numero: string;
  ordem_id: number;
  ordem_numero: string;
  ordem_titulo: string;
  equipamento_tag: string;
  unidade: string;
  tipo: TipoPT;
  status: StatusPT;
  riscos: string[];
  medidas_controle: string | null;
  validade_horas: number;
  solicitante_id: number;
  solicitante_nome: string;
  aprovador_id: number | null;
  aprovador_nome: string | null;
  comentario_decisao: string | null;
  validade_inicio: string | null;
  validade_fim: string | null;
  criada_em: string;
  decidida_em: string | null;
  version: number;
  // somente quando schema_version >= 3 (Extra 1 — LOTO)
  requer_loto?: boolean;
  bloqueios?: Bloqueio[];
}

export interface HistoricoItem {
  id: number;
  entidade: "OS" | "PT";
  entidade_id: number;
  de_status: string | null;
  para_status: string;
  usuario_nome: string | null;
  comentario: string | null;
  criado_em: string;
}

// ---------- Saúde / metadados ----------

export interface HealthDb {
  status: string;
  latencia_ms: number;
}

export interface Meta {
  empresa: string;
  schema_version: number;
  loto_habilitado: boolean;
  branch: string | null;
  modo_auth: ModoAuth;
  ambiente: string;
}

export interface TabelaInfo {
  schema: string;
  tabela: string;
  tipo: "OLTP" | "SYNCED";
  dono: string;
  linhas_estimadas: number;
}

export interface Conexao {
  rodando_em: "docker" | "host";
  hostname: string;
  modo_auth: ModoAuth;
  usuario_pg: string;
  host: string;
  porta: number;
  database: string;
  projeto: string | null;
  branch: string | null;
  endpoint: string | null;
  versao_postgres: string;
  schema_version: number;
  latencia_ms: number;
  token: { expira_em: string | null; minutos_restantes: number | null; renovacoes: number } | null;
  pool: {
    tamanho: number;
    disponiveis: number;
    em_espera: number;
    max: number;
    min: number;
    conexoes_criadas: number;
    erros: number;
  };
  endpoint_info: {
    estado: string;
    min_cu: number;
    max_cu: number;
    suspend_timeout: string | null;
    ultimo_ativo: string | null;
  } | null;
  tabelas: TabelaInfo[];
  privilegios_analitico_ok: boolean;
}

// ---------- Equipamentos ----------

export interface EquipamentosResposta {
  fonte: FonteAnalitica;
  atualizado_em: string | null;
  itens: Equipamento[];
}

export interface PontoTendencia {
  data: string;
  vibracao_mm_s: number;
  temperatura_c: number;
  pressao_bar: number;
  corrente_a: number;
}

export interface EquipamentoDetalheResposta {
  fonte: FonteAnalitica;
  equipamento: Equipamento;
  tendencia: PontoTendencia[];
  ordens: OrdemResumo[];
}

export interface FiltrosEquipamentos {
  unidade?: string;
  risco?: Risco;
  busca?: string;
}

// ---------- Ordens ----------

export interface FiltrosOrdens {
  status?: StatusOS;
  unidade?: string;
  prioridade?: Prioridade;
  busca?: string;
  limite?: number;
  offset?: number;
}

export interface OrdensResposta {
  itens: OrdemResumo[];
  total: number;
}

export interface OrdemDetalheResposta {
  ordem: Ordem;
  historico: HistoricoItem[];
  permissoes: Permissao[];
}

export interface NovaOrdemBody {
  equipamento_tag: string;
  tipo: TipoOS;
  prioridade: Prioridade;
  titulo: string;
  descricao?: string;
  solicitante_id: number;
  data_prevista?: string;
}

export interface AtualizarOrdemBody {
  version: number;
  usuario_id: number;
  titulo?: string;
  descricao?: string;
  prioridade?: Prioridade;
  responsavel_id?: number;
  data_prevista?: string;
}

export interface TransicaoOrdemBody {
  para_status: StatusOS;
  usuario_id: number;
  version: number;
  comentario?: string;
}

// ---------- Permissões ----------

export interface FiltrosPermissoes {
  status?: StatusPT;
  unidade?: string;
}

export interface PermissoesResposta {
  itens: Permissao[];
}

export interface NovaPermissaoBody {
  ordem_id: number;
  tipo: TipoPT;
  riscos: string[];
  medidas_controle?: string;
  validade_horas: number;
  solicitante_id: number;
  requer_loto?: boolean;
}

export interface DecisaoPermissaoBody {
  usuario_id: number;
  version: number;
  comentario?: string;
}

export interface RejeicaoPermissaoBody {
  usuario_id: number;
  version: number;
  comentario: string;
}

export interface IniciarPermissaoBody {
  usuario_id: number;
  version: number;
}

export interface EncerrarPermissaoBody {
  usuario_id: number;
  version: number;
  horas_indisponivel?: number;
  comentario?: string;
}

export interface NovoBloqueioBody {
  usuario_id: number;
  ponto_isolamento: string;
  tipo_energia: TipoEnergia;
  cadeado_numero: string;
}

// ---------- Painel ----------

export interface KpisOltp {
  os_abertas: number;
  os_em_execucao: number;
  os_p1_abertas: number;
  pts_aguardando_aprovacao: number;
  pts_ativas: number;
  os_concluidas_7d: number;
  consultado_em: string;
}

export interface KpiUnidade {
  unidade: string;
  data_referencia: string;
  disponibilidade_pct: number;
  mttr_horas: number | null;
  backlog_os: number;
  equipamentos_risco_alto: number;
  health_score_medio: number | null;
}

export interface EquipamentoRisco {
  tag: string;
  nome: string;
  unidade: string;
  health_score: number | null;
  risco: Risco | null;
  principal_sinal: string | null;
}

export interface KpisResposta {
  oltp: KpisOltp;
  lakehouse: {
    fonte: FonteAnalitica;
    atualizado_em: string | null;
    por_unidade: KpiUnidade[];
  } | null;
  equipamentos_risco: EquipamentoRisco[];
}

export interface SeriesResposta {
  os_por_dia: { data: string; abertas: number; concluidas: number }[];
  os_por_status: { status: StatusOS; total: number }[];
  os_por_unidade: { unidade: string; abertas: number; criticas: number }[];
}
