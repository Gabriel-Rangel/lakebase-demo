import { Flame } from "lucide-react";

export function RiscoChips({ riscos, max }: { riscos: string[] | null | undefined; max?: number }) {
  const lista = riscos ?? [];
  if (lista.length === 0) return <span className="text-xs text-muted-foreground">Sem riscos informados</span>;
  const visiveis = max ? lista.slice(0, max) : lista;
  const resto = lista.length - visiveis.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visiveis.map((r) => (
        <span
          key={r}
          className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-800"
        >
          <Flame className="h-3 w-3" /> {r}
        </span>
      ))}
      {resto > 0 && (
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">+{resto}</span>
      )}
    </div>
  );
}
