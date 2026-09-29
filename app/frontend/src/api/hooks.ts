import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { usePollingInterval } from "@/store/app-store";

import { ApiError } from "./client";
import * as ep from "./endpoints";
import type {
  AtualizarOrdemBody,
  Ordem,
  OrdemDetalheResposta,
  EncerrarPermissaoBody,
  FiltrosEquipamentos,
  FiltrosOrdens,
  FiltrosPermissoes,
  NovaOrdemBody,
  NovaPermissaoBody,
  NovoBloqueioBody,
  TransicaoOrdemBody,
} from "./types";

export const chaves = {
  meta: ["meta"] as const,
  conexao: ["conexao"] as const,
  healthDb: ["health-db"] as const,
  usuarios: ["usuarios"] as const,
  equipamentos: (f: FiltrosEquipamentos = {}) => ["equipamentos", f] as const,
  equipamento: (tag: string) => ["equipamento", tag] as const,
  ordens: (f: FiltrosOrdens = {}) => ["ordens", f] as const,
  ordem: (id: number) => ["ordem", id] as const,
  permissoes: (f: FiltrosPermissoes = {}) => ["permissoes", f] as const,
  kpis: ["painel", "kpis"] as const,
  series: (dias: number) => ["painel", "series", dias] as const,
};

/** Tudo o que muda quando uma OS/PT muda de estado. */
export function invalidarOperacional(qc: QueryClient) {
  for (const raiz of ["ordens", "ordem", "permissoes", "painel", "equipamentos", "equipamento"]) {
    void qc.invalidateQueries({ queryKey: [raiz] });
  }
}

// ---------------- Queries ----------------

export function useMeta() {
  // Também respeita o switch de polling (não impede o scale-to-zero quando desligado).
  const intervalo = usePollingInterval(60_000);
  return useQuery({ queryKey: chaves.meta, queryFn: ep.getMeta, staleTime: 30_000, refetchInterval: intervalo });
}

export function useConexao() {
  const intervalo = usePollingInterval();
  return useQuery({ queryKey: chaves.conexao, queryFn: ep.getConexao, refetchInterval: intervalo });
}

/** Lê /api/conexao só do cache (não dispara requisição) — usado no rodapé da sidebar. */
export function useConexaoEmCache() {
  return useQuery({ queryKey: chaves.conexao, queryFn: ep.getConexao, enabled: false });
}

/** Latência medida a cada 5s (respeita o switch de polling para deixar o compute escalar a zero). */
export function useLatencia() {
  const intervalo = usePollingInterval(5_000);
  return useQuery({
    queryKey: chaves.healthDb,
    queryFn: ep.getHealthDb,
    refetchInterval: intervalo,
    retry: false,
  });
}

export function useUsuarios() {
  return useQuery({ queryKey: chaves.usuarios, queryFn: ep.getUsuarios, staleTime: 5 * 60_000 });
}

export function useEquipamentos(filtros: FiltrosEquipamentos = {}, opcoes: { polling?: boolean } = {}) {
  const intervalo = usePollingInterval();
  return useQuery({
    queryKey: chaves.equipamentos(filtros),
    queryFn: () => ep.getEquipamentos(filtros),
    refetchInterval: opcoes.polling === false ? false : intervalo,
    placeholderData: keepPreviousData,
  });
}

/** Unidades (FPSOs) conhecidas, a partir da lista completa de equipamentos. */
export function useUnidades(): string[] {
  const { data } = useEquipamentos({}, { polling: false });
  const set = new Set<string>();
  for (const e of data?.itens ?? []) if (e.unidade) set.add(e.unidade);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function useEquipamento(tag: string | undefined) {
  return useQuery({
    queryKey: chaves.equipamento(tag ?? ""),
    queryFn: () => ep.getEquipamento(tag as string),
    enabled: !!tag,
  });
}

export function useOrdens(filtros: FiltrosOrdens) {
  const intervalo = usePollingInterval();
  return useQuery({
    queryKey: chaves.ordens(filtros),
    queryFn: () => ep.getOrdens(filtros),
    refetchInterval: intervalo,
    placeholderData: keepPreviousData,
  });
}

/**
 * Detalhe da OS: SEM polling de propósito — assim duas abas ficam com versões
 * diferentes e o 409 (lock otimista) aparece na demo.
 */
export function useOrdem(id: number | null) {
  return useQuery({
    queryKey: chaves.ordem(id ?? 0),
    queryFn: () => ep.getOrdem(id as number),
    enabled: id !== null && Number.isFinite(id) && id > 0,
  });
}

export function usePermissoes(filtros: FiltrosPermissoes = {}) {
  const intervalo = usePollingInterval();
  return useQuery({
    queryKey: chaves.permissoes(filtros),
    queryFn: () => ep.getPermissoes(filtros),
    refetchInterval: intervalo,
    placeholderData: keepPreviousData,
  });
}

export function useKpis() {
  const intervalo = usePollingInterval();
  return useQuery({ queryKey: chaves.kpis, queryFn: ep.getKpis, refetchInterval: intervalo });
}

export function useSeries(dias = 30) {
  const intervalo = usePollingInterval();
  return useQuery({ queryKey: chaves.series(dias), queryFn: () => ep.getSeries(dias), refetchInterval: intervalo });
}

// ---------------- Mutations ----------------

/** Em 409 os dados locais estão velhos: recarrega (o toast já foi mostrado pelo interceptor). */
function aoErrarRecarregar(qc: QueryClient) {
  return (erro: unknown) => {
    if (erro instanceof ApiError && (erro.status === 409 || erro.status === 422)) {
      invalidarOperacional(qc);
    }
  };
}

export function useCriarOsPreditiva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tag: string; solicitanteId: number }) => ep.criarOsPreditiva(v.tag, v.solicitanteId),
    onSuccess: () => invalidarOperacional(qc),
  });
}

export function useCriarOrdem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NovaOrdemBody) => ep.criarOrdem(body),
    onSuccess: () => invalidarOperacional(qc),
  });
}

/** Aplica a OS devolvida pelo backend no cache do detalhe (versão nova já na tela). */
function aplicarOrdemNoCache(qc: QueryClient, id: number, ordem: Ordem) {
  qc.setQueryData<OrdemDetalheResposta>(chaves.ordem(id), (antigo) =>
    antigo && ordem ? { ...antigo, ordem: { ...antigo.ordem, ...ordem } } : antigo,
  );
}

export function useAtualizarOrdem(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AtualizarOrdemBody) => ep.atualizarOrdem(id, body),
    onSuccess: (ordem) => {
      aplicarOrdemNoCache(qc, id, ordem);
      invalidarOperacional(qc);
    },
    onError: aoErrarRecarregar(qc),
  });
}

export function useTransicionarOrdem(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TransicaoOrdemBody) => ep.transicionarOrdem(id, body),
    onSuccess: (ordem) => {
      aplicarOrdemNoCache(qc, id, ordem);
      invalidarOperacional(qc);
    },
    onError: aoErrarRecarregar(qc),
  });
}

export function useCriarPermissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NovaPermissaoBody) => ep.criarPermissao(body),
    onSuccess: () => invalidarOperacional(qc),
    onError: aoErrarRecarregar(qc),
  });
}

export type AcaoPermissao =
  | { acao: "aprovar"; id: number; usuario_id: number; version: number; comentario?: string }
  | { acao: "rejeitar"; id: number; usuario_id: number; version: number; comentario: string }
  | { acao: "iniciar"; id: number; usuario_id: number; version: number }
  | ({ acao: "encerrar"; id: number } & EncerrarPermissaoBody);

export function useAcaoPermissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AcaoPermissao) => {
      switch (v.acao) {
        case "aprovar":
          return ep.aprovarPermissao(v.id, { usuario_id: v.usuario_id, version: v.version, comentario: v.comentario });
        case "rejeitar":
          return ep.rejeitarPermissao(v.id, { usuario_id: v.usuario_id, version: v.version, comentario: v.comentario });
        case "iniciar":
          return ep.iniciarPermissao(v.id, { usuario_id: v.usuario_id, version: v.version });
        case "encerrar":
          return ep.encerrarPermissao(v.id, {
            usuario_id: v.usuario_id,
            version: v.version,
            horas_indisponivel: v.horas_indisponivel,
            comentario: v.comentario,
          });
      }
    },
    onSuccess: () => invalidarOperacional(qc),
    onError: aoErrarRecarregar(qc),
  });
}

export function useAdicionarBloqueio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { permissaoId: number; body: NovoBloqueioBody }) => ep.adicionarBloqueio(v.permissaoId, v.body),
    onSuccess: () => invalidarOperacional(qc),
  });
}

export function useRemoverBloqueio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { permissaoId: number; bloqueioId: number; usuarioId: number }) =>
      ep.removerBloqueio(v.permissaoId, v.bloqueioId, v.usuarioId),
    onSuccess: () => invalidarOperacional(qc),
  });
}
