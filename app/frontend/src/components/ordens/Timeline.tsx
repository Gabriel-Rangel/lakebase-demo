import { History } from "lucide-react";

import type { HistoricoItem, Permissao } from "@/api/types";
import { EmptyState } from "@/components/common/estados";
import { STATUS_OS_LABEL, STATUS_PT_LABEL } from "@/lib/dominio";
import { formatDataHora, formatRelativo, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

const COR_PONTO: Record<string, string> = {
  ABERTA: "bg-sky-500",
  PLANEJADA: "bg-indigo-500",
  AGUARDANDO_PT: "bg-amber-500",
  SOLICITADA: "bg-amber-500",
  APROVADA: "bg-sky-500",
  EM_EXECUCAO: "bg-teal-500",
  CONCLUIDA: "bg-emerald-500",
  ENCERRADA: "bg-emerald-500",
  REJEITADA: "bg-red-500",
  CANCELADA: "bg-zinc-400",
};

function nomeStatus(entidade: "OS" | "PT", s: string | null): string {
  if (!s) return "";
  const mapa: Record<string, string> = entidade === "OS" ? STATUS_OS_LABEL : STATUS_PT_LABEL;
  return mapa[s] ?? s;
}

export function Timeline({ itens, permissoes }: { itens: HistoricoItem[]; permissoes: Permissao[] }) {
  if (itens.length === 0) {
    return <EmptyState compacto icone={<History />} titulo="Sem histórico ainda" />;
  }
  const numeroPt = new Map(permissoes.map((p) => [p.id, p.numero]));
  const ordenados = [...itens].sort(
    (a, b) => (parseData(b.criado_em)?.getTime() ?? 0) - (parseData(a.criado_em)?.getTime() ?? 0) || b.id - a.id,
  );

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {ordenados.map((h) => {
        const de = nomeStatus(h.entidade, h.de_status);
        const para = nomeStatus(h.entidade, h.para_status);
        return (
          <li key={h.id} className="relative">
            <span
              className={cn(
                "absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white",
                COR_PONTO[h.para_status] ?? "bg-slate-400",
              )}
            />
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  h.entidade === "OS" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800",
                )}
              >
                {h.entidade === "PT" ? (numeroPt.get(h.entidade_id) ?? "PT") : "OS"}
              </span>
              {de ? (
                <span className="text-slate-700">
                  {de} <span className="text-slate-400">→</span> <b>{para}</b>
                </span>
              ) : (
                <span className="text-slate-700">
                  Criada como <b>{para}</b>
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {h.usuario_nome ?? "Sistema"} · <span title={formatDataHora(h.criado_em)}>{formatRelativo(h.criado_em)}</span>{" "}
              · {formatDataHora(h.criado_em)}
            </div>
            {h.comentario && (
              <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs italic text-slate-700">“{h.comentario}”</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
