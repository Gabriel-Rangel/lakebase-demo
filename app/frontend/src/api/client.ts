import axios, { AxiosError } from "axios";
import { toast } from "sonner";

import { useStatusApi } from "@/store/status-api";

declare module "axios" {
  interface AxiosRequestConfig {
    /** Status HTTP que o chamador trata sozinho (sem toast global). Use 0 para erro de rede. */
    silenciar?: number[];
    /** Sujeito da frase de conflito de versão, ex.: "Esta OS" / "Esta PT". */
    rotuloConflito?: string;
  }
}

/** Erro normalizado da API (todas as chamadas rejeitam com ApiError). */
export class ApiError extends Error {
  /** null = sem resposta (rede / backend fora do ar). */
  readonly status: number | null;
  readonly mensagem: string;
  /** Preenchido em 409 de concorrência (campo version desatualizado). */
  readonly versaoAtual: number | null;
  readonly detalhe: unknown;
  /** true quando o interceptor já mostrou um toast para este erro. */
  readonly notificado: boolean;
  /** true quando o backend não respondeu (rede, 502/504, proxy de dev sem backend). */
  readonly semBackend: boolean;

  constructor(args: {
    status: number | null;
    mensagem: string;
    versaoAtual?: number | null;
    detalhe?: unknown;
    notificado?: boolean;
    semBackend?: boolean;
  }) {
    super(args.mensagem);
    this.name = "ApiError";
    this.status = args.status;
    this.mensagem = args.mensagem;
    this.versaoAtual = args.versaoAtual ?? null;
    this.detalhe = args.detalhe;
    this.notificado = args.notificado ?? false;
    this.semBackend = args.semBackend ?? false;
  }

  get ehConflitoDeVersao(): boolean {
    return this.status === 409 && this.versaoAtual !== null;
  }
}

export function ehApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

const MENSAGEM_PADRAO: Record<number, string> = {
  400: "Requisição inválida.",
  401: "Não autenticado no backend.",
  403: "Operação não autorizada.",
  404: "Recurso não encontrado.",
  409: "Conflito: o registro foi alterado ou o estado atual não permite a operação.",
  422: "Operação não permitida ou dados inválidos.",
  500: "Erro interno no backend.",
  502: "O backend não respondeu (proxy).",
  503: "Lakebase indisponível no momento — o compute pode estar acordando do scale-to-zero.",
  504: "O backend demorou demais para responder.",
};

const MENSAGEM_REDE =
  "Não foi possível falar com a API. Verifique se o container do backend está rodando.";

function textoPydantic(itens: unknown[]): string {
  const partes = itens.slice(0, 3).map((item) => {
    if (!item || typeof item !== "object") return String(item);
    const rec = item as { loc?: unknown; msg?: unknown };
    const loc = Array.isArray(rec.loc)
      ? rec.loc.filter((p) => p !== "body" && p !== "query" && p !== "path").join(".")
      : "";
    const msg = typeof rec.msg === "string" ? rec.msg : "valor inválido";
    return loc ? `${loc}: ${msg}` : msg;
  });
  return `Dados inválidos — ${partes.join("; ")}`;
}

function extrairDetalhe(data: unknown): { mensagem: string | null; versaoAtual: number | null } {
  if (!data || typeof data !== "object") return { mensagem: null, versaoAtual: null };
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return { mensagem: detail, versaoAtual: null };
  if (Array.isArray(detail)) return { mensagem: textoPydantic(detail), versaoAtual: null };
  if (detail && typeof detail === "object") {
    const d = detail as { mensagem?: unknown; versao_atual?: unknown };
    return {
      mensagem: typeof d.mensagem === "string" ? d.mensagem : null,
      versaoAtual: typeof d.versao_atual === "number" ? d.versao_atual : null,
    };
  }
  return { mensagem: null, versaoAtual: null };
}

/** Rotas que respondem sem tocar no banco — sucesso nelas não prova que o Lakebase acordou. */
function rotaSemBanco(url: string | undefined): boolean {
  if (!url) return false;
  return /\/health\/?$/.test(url) || /\/meta\/?$/.test(url);
}

export const api = axios.create({
  baseURL: "/api",
  timeout: 60_000,
  headers: { Accept: "application/json" },
});

api.interceptors.response.use(
  (resposta) => {
    const status = useStatusApi.getState();
    if (status.estado === "offline") status.marcarOk();
    else if (status.estado === "acordando" && !rotaSemBanco(resposta.config.url)) status.marcarOk();
    return resposta;
  },
  (erro: unknown) => {
    if (axios.isCancel(erro)) return Promise.reject(erro);

    const axiosErro = erro as AxiosError;
    const config = axiosErro.config;
    const resposta = axiosErro.response;
    const status = resposta ? resposta.status : null;
    const metodo = (config?.method ?? "get").toLowerCase();
    const silenciar = config?.silenciar ?? [];
    const { mensagem: msgApi, versaoAtual } = extrairDetalhe(resposta?.data);

    // 500 sem corpo = proxy (Vite em dev) sem conseguir falar com o backend.
    const corpoVazio = !!resposta && (resposta.data === "" || resposta.data === null || resposta.data === undefined);
    const semRede = status === null || (status === 500 && corpoVazio);
    const backendFora = semRede || status === 502 || status === 504;

    const mensagem =
      msgApi ??
      (semRede ? MENSAGEM_REDE : (MENSAGEM_PADRAO[status as number] ?? `Erro inesperado (HTTP ${status}).`));

    const statusApi = useStatusApi.getState();
    let notificado = false;
    const silenciado = silenciar.includes(semRede ? 0 : (status as number));

    if (backendFora) {
      statusApi.marcarOffline(mensagem);
      if (!silenciado) {
        toast.error("API indisponível", { id: "api-offline", description: mensagem });
        notificado = true;
      }
    } else if (status === 503) {
      statusApi.marcarAcordando(mensagem);
      if (!silenciado) {
        toast.warning("Lakebase acordando (scale-to-zero)", {
          id: "lakebase-503",
          description: `${mensagem} Tentando novamente…`,
        });
        notificado = true;
      }
    } else if (status === 409) {
      if (!silenciado) {
        if (versaoAtual !== null) {
          const frase = config?.rotuloConflito
            ? `${config.rotuloConflito} foi alterada por outra pessoa`
            : "Este registro foi alterado por outra pessoa";
          toast.warning(
            `${frase} (versão ${versaoAtual}). Recarregamos os dados.`,
            { id: `409-${config?.url ?? ""}`, description: msgApi ?? undefined },
          );
        } else {
          toast.warning(mensagem, { id: `409-${mensagem}` });
        }
        notificado = true;
      }
    } else if (status === 422) {
      if (!silenciado) {
        toast.error(mensagem, { id: `422-${mensagem}` });
        notificado = true;
      }
    } else if (metodo !== "get" && !silenciado) {
      // Em GETs, a própria tela mostra o erro inline (ex.: 404 no detalhe).
      toast.error(mensagem, { id: `${status}-${mensagem}` });
      notificado = true;
    }

    return Promise.reject(
      new ApiError({ status, mensagem, versaoAtual, detalhe: resposta?.data, notificado, semBackend: backendFora }),
    );
  },
);
