import type { Risco } from "@/api/types";
import { Progress } from "@/components/ui/progress";
import { RISCO_COR, riscoPorScore } from "@/lib/dominio";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Barra de health score colorida pelo risco (ou pela faixa do score). "—" quando nulo. */
export function HealthBar({
  score,
  risco,
  className,
}: {
  score: number | null | undefined;
  risco?: Risco | null;
  className?: string;
}) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const faixa = (risco && RISCO_COR[risco] ? risco : riscoPorScore(score)) ?? "BAIXO";
  return (
    <div className={cn("flex min-w-[120px] items-center gap-2", className)}>
      <Progress
        value={score}
        className="h-2 flex-1"
        indicatorClassName={RISCO_COR[faixa].barra}
        aria-label={`Health score ${formatNumero(score)}`}
      />
      <span className="w-8 text-right text-sm font-semibold tabular">{formatNumero(score)}</span>
    </div>
  );
}
