import { limparParams } from "@/lib/utils";

import { api } from "./client";
import type {
  AtualizarOrdemBody,
  Bloqueio,
  Conexao,
  DecisaoPermissaoBody,
  EncerrarPermissaoBody,
  EquipamentoDetalheResposta,
  EquipamentosResposta,
  FiltrosEquipamentos,
  FiltrosOrdens,
  FiltrosPermissoes,
  HealthDb,
  IniciarPermissaoBody,
  KpisResposta,
  Meta,
  NovaOrdemBody,
  NovaPermissaoBody,
  NovoBloqueioBody,
  Ordem,
  OrdemDetalheResposta,
  OrdensResposta,
  Permissao,
  PermissoesResposta,
  RejeicaoPermissaoBody,
  SeriesResposta,
  TransicaoOrdemBody,
  Usuario,
} from "./types";

const enc = encodeURIComponent;

// ---------- Saúde / metadados ----------

export async function getHealthDb(): Promise<HealthDb> {
  // O banner de 503 faz o próprio feedback — sem toast aqui.
  const { data } = await api.get<HealthDb>("/health/db", { silenciar: [0, 502, 503, 504] });
  return data;
}

export async function getHealth(): Promise<{ status: string }> {
  const { data } = await api.get<{ status: string }>("/health", { silenciar: [0, 502, 503, 504] });
  return data;
}

export async function getMeta(): Promise<Meta> {
  const { data } = await api.get<Meta>("/meta");
  return data;
}

export async function getConexao(): Promise<Conexao> {
  const { data } = await api.get<Conexao>("/conexao");
  return data;
}

// ---------- Usuários ----------

export async function getUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get<Usuario[]>("/usuarios");
  return Array.isArray(data) ? data : [];
}

// ---------- Equipamentos ----------

export async function getEquipamentos(filtros: FiltrosEquipamentos = {}): Promise<EquipamentosResposta> {
  const { data } = await api.get<EquipamentosResposta>("/equipamentos", {
    params: limparParams({ ...filtros }),
  });
  return { ...data, itens: data?.itens ?? [] };
}

export async function getEquipamento(tag: string): Promise<EquipamentoDetalheResposta> {
  const { data } = await api.get<EquipamentoDetalheResposta>(`/equipamentos/${enc(tag)}`);
  return { ...data, tendencia: data?.tendencia ?? [], ordens: data?.ordens ?? [] };
}

export async function criarOsPreditiva(tag: string, solicitanteId: number): Promise<Ordem> {
  const { data } = await api.post<Ordem>(`/equipamentos/${enc(tag)}/os-preditiva`, {
    solicitante_id: solicitanteId,
  });
  return data;
}

// ---------- Ordens de Serviço ----------

export async function getOrdens(filtros: FiltrosOrdens = {}): Promise<OrdensResposta> {
  const { data } = await api.get<OrdensResposta>("/ordens", { params: limparParams({ ...filtros }) });
  return { itens: data?.itens ?? [], total: data?.total ?? 0 };
}

export async function getOrdem(id: number): Promise<OrdemDetalheResposta> {
  const { data } = await api.get<OrdemDetalheResposta>(`/ordens/${id}`);
  return { ...data, historico: data?.historico ?? [], permissoes: data?.permissoes ?? [] };
}

export async function criarOrdem(body: NovaOrdemBody): Promise<Ordem> {
  const { data } = await api.post<Ordem>("/ordens", body);
  return data;
}

export async function atualizarOrdem(id: number, body: AtualizarOrdemBody): Promise<Ordem> {
  const { data } = await api.patch<Ordem>(`/ordens/${id}`, body, { rotuloConflito: "Esta OS" });
  return data;
}

export async function transicionarOrdem(id: number, body: TransicaoOrdemBody): Promise<Ordem> {
  const { data } = await api.post<Ordem>(`/ordens/${id}/transicao`, body, { rotuloConflito: "Esta OS" });
  return data;
}

// ---------- Permissões de Trabalho ----------

export async function getPermissoes(filtros: FiltrosPermissoes = {}): Promise<PermissoesResposta> {
  const { data } = await api.get<PermissoesResposta>("/permissoes", {
    params: limparParams({ ...filtros }),
  });
  return { itens: data?.itens ?? [] };
}

export async function criarPermissao(body: NovaPermissaoBody): Promise<Permissao> {
  const { data } = await api.post<Permissao>("/permissoes", body);
  return data;
}

export async function aprovarPermissao(id: number, body: DecisaoPermissaoBody): Promise<Permissao> {
  const { data } = await api.post<Permissao>(`/permissoes/${id}/aprovar`, body, { rotuloConflito: "Esta PT" });
  return data;
}

export async function rejeitarPermissao(id: number, body: RejeicaoPermissaoBody): Promise<Permissao> {
  const { data } = await api.post<Permissao>(`/permissoes/${id}/rejeitar`, body, { rotuloConflito: "Esta PT" });
  return data;
}

export async function iniciarPermissao(id: number, body: IniciarPermissaoBody): Promise<Permissao> {
  const { data } = await api.post<Permissao>(`/permissoes/${id}/iniciar`, body, { rotuloConflito: "Esta PT" });
  return data;
}

export async function encerrarPermissao(id: number, body: EncerrarPermissaoBody): Promise<Permissao> {
  const { data } = await api.post<Permissao>(`/permissoes/${id}/encerrar`, body, { rotuloConflito: "Esta PT" });
  return data;
}

export async function adicionarBloqueio(permissaoId: number, body: NovoBloqueioBody): Promise<Bloqueio> {
  const { data } = await api.post<Bloqueio>(`/permissoes/${permissaoId}/bloqueios`, body);
  return data;
}

export async function removerBloqueio(
  permissaoId: number,
  bloqueioId: number,
  usuarioId: number,
): Promise<Bloqueio> {
  const { data } = await api.post<Bloqueio>(`/permissoes/${permissaoId}/bloqueios/${bloqueioId}/remover`, {
    usuario_id: usuarioId,
  });
  return data;
}

// ---------- Painel ----------

export async function getKpis(): Promise<KpisResposta> {
  const { data } = await api.get<KpisResposta>("/painel/kpis");
  return {
    ...data,
    lakehouse: data?.lakehouse
      ? { ...data.lakehouse, por_unidade: data.lakehouse.por_unidade ?? [] }
      : null,
    equipamentos_risco: data?.equipamentos_risco ?? [],
  };
}

export async function getSeries(dias = 30): Promise<SeriesResposta> {
  const { data } = await api.get<SeriesResposta>("/painel/series", { params: { dias } });
  return {
    os_por_dia: data?.os_por_dia ?? [],
    os_por_status: data?.os_por_status ?? [],
    os_por_unidade: data?.os_por_unidade ?? [],
  };
}
