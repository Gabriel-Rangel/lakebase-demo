import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const VAZIO = "—";

/**
 * Converte strings de data da API em Date.
 * - "YYYY-MM-DD" (só data) é interpretada como data LOCAL (evita cair no dia anterior em UTC-3).
 * - Datetime sem offset é tratado como UTC (o contrato diz que tudo é UTC).
 */
export function parseData(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const s = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parseISO(s);
    return isValid(d) ? d : null;
  }
  const temHora = /\d{2}:\d{2}/.test(s);
  const temOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const normalizado = temHora && !temOffset ? `${s.replace(" ", "T")}Z` : s.replace(" ", "T");
  const d = parseISO(normalizado);
  return isValid(d) ? d : null;
}

export function formatData(valor: string | null | undefined): string {
  const d = parseData(valor);
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : VAZIO;
}

export function formatDataCurta(valor: string | null | undefined): string {
  const d = parseData(valor);
  return d ? format(d, "dd/MM", { locale: ptBR }) : VAZIO;
}

export function formatDataHora(valor: string | null | undefined): string {
  const d = parseData(valor);
  return d ? format(d, "dd/MM/yyyy HH:mm", { locale: ptBR }) : VAZIO;
}

export function formatHora(valor: string | null | undefined): string {
  const d = parseData(valor);
  return d ? format(d, "HH:mm:ss", { locale: ptBR }) : VAZIO;
}

/** "há 5 minutos" / "em 3 horas". */
export function formatRelativo(valor: string | null | undefined): string {
  const d = parseData(valor);
  if (!d) return VAZIO;
  return formatDistanceToNowStrict(d, { locale: ptBR, addSuffix: true });
}

/** Valor para <input type="date"> a partir de data/datetime da API. */
export function paraInputData(valor: string | null | undefined): string {
  const d = parseData(valor);
  return d ? format(d, "yyyy-MM-dd") : "";
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const chave = `${min}-${max}`;
  let f = nfCache.get(chave);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
    nfCache.set(chave, f);
  }
  return f;
}

export function formatNumero(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return VAZIO;
  return nf(casas, casas).format(valor);
}

/** Até N casas, sem zeros à direita (ex.: 3,5 / 12). */
export function formatNumeroFlex(valor: number | null | undefined, maxCasas = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return VAZIO;
  return nf(0, maxCasas).format(valor);
}

/** Percentual a partir de valor 0–100. */
export function formatPct(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return VAZIO;
  return `${nf(casas, casas).format(valor)}%`;
}

/** Percentual a partir de fração 0–1. */
export function formatFracaoPct(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return VAZIO;
  return `${nf(casas, casas).format(valor * 100)}%`;
}

/**
 * disponibilidade_pct deve vir em 0–100; se vier como fração (<= 1) convertemos.
 * Disponibilidade real de FPSO nunca é <= 1%, então a heurística é segura.
 */
export function normalizarPct(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  return valor <= 1 ? valor * 100 : valor;
}

export function formatMs(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return VAZIO;
  return `${nf(0, valor < 10 ? 1 : 0).format(valor)} ms`;
}

/** "300s" -> "5 min"; "90s" -> "1 min 30 s"; outros formatos passam direto. */
export function formatDuracaoTexto(valor: string | null | undefined): string {
  if (!valor) return VAZIO;
  const m = /^(\d+(?:\.\d+)?)\s*s$/i.exec(valor.trim());
  if (!m) return valor;
  const total = Math.round(Number(m[1]));
  if (total < 60) return `${total} s`;
  const min = Math.floor(total / 60);
  const seg = total % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const rmin = min % 60;
    return rmin ? `${h} h ${rmin} min` : `${h} h`;
  }
  return seg ? `${min} min ${seg} s` : `${min} min`;
}

export { VAZIO };

/** Data só-dia -> "dd/MM/yyyy"; datetime -> "dd/MM/yyyy HH:mm". */
export function formatDataAuto(valor: string | null | undefined): string {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return formatData(valor);
  return formatDataHora(valor);
}
