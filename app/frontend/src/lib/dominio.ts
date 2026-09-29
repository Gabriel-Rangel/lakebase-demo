import type {
  Criticidade,
  ModoAuth,
  Papel,
  Prioridade,
  Risco,
  StatusOS,
  StatusPT,
  TipoEnergia,
  TipoOS,
  TipoPT,
} from "@/api/types";

// ---------- Rótulos pt-BR ----------

export const PAPEL_LABEL: Record<Papel, string> = {
  TECNICO: "Técnico",
  SUPERVISOR: "Supervisor",
  SEGURANCA: "Segurança",
  PLANEJADOR: "Planejador",
};

export const RISCO_LABEL: Record<Risco, string> = {
  BAIXO: "Baixo",
  MEDIO: "Médio",
  ALTO: "Alto",
  CRITICO: "Crítico",
};
export const RISCOS: Risco[] = ["CRITICO", "ALTO", "MEDIO", "BAIXO"];

export const STATUS_OS_LABEL: Record<StatusOS, string> = {
  ABERTA: "Aberta",
  PLANEJADA: "Planejada",
  AGUARDANDO_PT: "Aguardando PT",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};
export const STATUS_OS: StatusOS[] = ["ABERTA", "PLANEJADA", "AGUARDANDO_PT", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"];
export const STATUS_OS_FINAIS: StatusOS[] = ["CONCLUIDA", "CANCELADA"];

export const STATUS_PT_LABEL: Record<StatusPT, string> = {
  SOLICITADA: "Solicitada",
  APROVADA: "Aprovada",
  REJEITADA: "Rejeitada",
  EM_EXECUCAO: "Em execução",
  ENCERRADA: "Encerrada",
  CANCELADA: "Cancelada",
};
export const STATUS_PT_FINAIS: StatusPT[] = ["ENCERRADA", "REJEITADA", "CANCELADA"];

export const TIPO_OS_LABEL: Record<TipoOS, string> = {
  CORRETIVA: "Corretiva",
  PREVENTIVA: "Preventiva",
  PREDITIVA: "Preditiva",
};
export const TIPOS_OS: TipoOS[] = ["CORRETIVA", "PREVENTIVA", "PREDITIVA"];

export const TIPO_PT_LABEL: Record<TipoPT, string> = {
  TRABALHO_A_QUENTE: "Trabalho a quente",
  ESPACO_CONFINADO: "Espaço confinado",
  ELETRICA: "Elétrica",
  ALTURA: "Trabalho em altura",
  GERAL: "Geral",
};
export const TIPOS_PT: TipoPT[] = ["GERAL", "TRABALHO_A_QUENTE", "ESPACO_CONFINADO", "ELETRICA", "ALTURA"];

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  P1: "P1 · Emergencial",
  P2: "P2 · Alta",
  P3: "P3 · Média",
  P4: "P4 · Baixa",
};
export const PRIORIDADES: Prioridade[] = ["P1", "P2", "P3", "P4"];

export const CRITICIDADE_LABEL: Record<Criticidade, string> = {
  A: "A · Alta",
  B: "B · Média",
  C: "C · Baixa",
};

export const TIPO_ENERGIA_LABEL: Record<TipoEnergia, string> = {
  ELETRICA: "Elétrica",
  HIDRAULICA: "Hidráulica",
  PNEUMATICA: "Pneumática",
  MECANICA: "Mecânica",
  QUIMICA: "Química",
};
export const TIPOS_ENERGIA: TipoEnergia[] = ["ELETRICA", "HIDRAULICA", "PNEUMATICA", "MECANICA", "QUIMICA"];

export const MODO_AUTH_LABEL: Record<ModoAuth, string> = {
  oauth: "OAuth M2M",
  password: "Senha nativa",
  profile: "Perfil CLI",
};

export const RISCOS_PT = [
  "Gás inflamável",
  "Pressão residual",
  "Energia elétrica",
  "Trabalho em altura",
  "Espaço confinado",
  "Produtos químicos",
  "Superfície quente",
] as const;

/** Papéis que podem aprovar/rejeitar PT. */
export const PAPEIS_APROVADORES: Papel[] = ["SUPERVISOR", "SEGURANCA"];

/** Rótulo seguro para enums vindos da API (tolera valores novos). */
export function rotulo<K extends string>(mapa: Record<K, string>, valor: string | null | undefined): string {
  if (!valor) return "—";
  return (mapa as Record<string, string>)[valor] ?? valor;
}

// ---------- Cores ----------

/** Cores de status (bom/atenção/sério/crítico) — sempre acompanhadas de rótulo. */
export const RISCO_COR: Record<Risco, { badge: string; barra: string; texto: string; hex: string }> = {
  BAIXO: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    barra: "bg-emerald-500",
    texto: "text-emerald-700",
    hex: "#0ca30c",
  },
  MEDIO: {
    badge: "border-yellow-300 bg-yellow-50 text-yellow-800",
    barra: "bg-yellow-400",
    texto: "text-yellow-700",
    hex: "#fab219",
  },
  ALTO: {
    badge: "border-orange-300 bg-orange-50 text-orange-800",
    barra: "bg-orange-500",
    texto: "text-orange-700",
    hex: "#ec835a",
  },
  CRITICO: {
    badge: "border-red-300 bg-red-600 text-white",
    barra: "bg-red-600",
    texto: "text-red-700",
    hex: "#d03b3b",
  },
};

/** Faixa de risco inferida pelo health score (quando o risco não veio). */
export function riscoPorScore(score: number | null | undefined): Risco | null {
  if (score === null || score === undefined) return null;
  if (score >= 75) return "BAIXO";
  if (score >= 55) return "MEDIO";
  if (score >= 35) return "ALTO";
  return "CRITICO";
}

export const STATUS_OS_COR: Record<StatusOS, string> = {
  ABERTA: "border-sky-200 bg-sky-50 text-sky-800",
  PLANEJADA: "border-indigo-200 bg-indigo-50 text-indigo-800",
  AGUARDANDO_PT: "border-amber-300 bg-amber-50 text-amber-800",
  EM_EXECUCAO: "border-teal-300 bg-teal-50 text-teal-800",
  CONCLUIDA: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELADA: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

export const STATUS_PT_COR: Record<StatusPT, string> = {
  SOLICITADA: "border-amber-300 bg-amber-50 text-amber-800",
  APROVADA: "border-sky-200 bg-sky-50 text-sky-800",
  REJEITADA: "border-red-200 bg-red-50 text-red-700",
  EM_EXECUCAO: "border-teal-300 bg-teal-50 text-teal-800",
  ENCERRADA: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELADA: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

export const PRIORIDADE_COR: Record<Prioridade, string> = {
  P1: "border-red-600 bg-red-600 text-white",
  P2: "border-orange-300 bg-orange-50 text-orange-800",
  P3: "border-slate-300 bg-slate-50 text-slate-700",
  P4: "border-slate-200 bg-white text-slate-500",
};

/** Paleta categórica validada (dataviz): azul, laranja, água. */
export const CORES_SERIE = {
  s1: "#2a78d6",
  s2: "#eb6834",
  s3: "#1baf7a",
} as const;
