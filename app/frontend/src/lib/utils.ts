import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Iniciais para avatar ("Ana Souza" -> "AS"). */
export function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Remove chaves com valor vazio/undefined/null (para query strings). */
export function limparParams<T extends Record<string, unknown>>(params: T): Partial<T> {
  const saida: Partial<T> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    (saida as Record<string, unknown>)[k] = v;
  }
  return saida;
}
