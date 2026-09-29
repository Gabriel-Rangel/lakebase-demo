import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TomKpi = "neutro" | "alerta" | "critico" | "positivo";

const TOM: Record<TomKpi, { icone: string; valor: string; borda: string }> = {
  neutro: { icone: "bg-slate-100 text-slate-600", valor: "text-navy", borda: "" },
  alerta: { icone: "bg-amber-100 text-amber-700", valor: "text-amber-700", borda: "border-l-4 border-l-amber-400" },
  critico: { icone: "bg-red-100 text-red-700", valor: "text-red-700", borda: "border-l-4 border-l-red-500" },
  positivo: { icone: "bg-emerald-100 text-emerald-700", valor: "text-emerald-700", borda: "" },
};

export function KpiCard({
  rotulo,
  valor,
  icone,
  dica,
  tom = "neutro",
  href,
}: {
  rotulo: string;
  valor: number | null | undefined;
  icone: ReactNode;
  dica?: string;
  tom?: TomKpi;
  href?: string;
}) {
  const t = TOM[tom];
  const corpo = (
    <Card
      className={cn(
        "h-full p-4 transition-shadow",
        t.borda,
        href && "cursor-pointer hover:border-slate-300 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4", t.icone)}>
          {icone}
        </span>
      </div>
      <div className={cn("mt-1 text-3xl font-semibold tabular", t.valor)}>{formatNumero(valor)}</div>
      {dica && <div className="mt-0.5 text-xs text-muted-foreground">{dica}</div>}
    </Card>
  );
  return href ? (
    <Link to={href} className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

export function KpiCardSkeleton() {
  return (
    <Card className="p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-2 h-3 w-20" />
    </Card>
  );
}
