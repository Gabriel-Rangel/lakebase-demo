import { Activity, AlertTriangle, Clock, ListTodo } from "lucide-react";

import type { KpiUnidade } from "@/api/types";
import { HealthBar } from "@/components/common/HealthBar";
import { Card } from "@/components/ui/card";
import { formatData, formatNumero, formatNumeroFlex, formatPct, normalizarPct } from "@/lib/format";
import { cn } from "@/lib/utils";

function corDisponibilidade(pct: number | null): string {
  if (pct === null) return "text-slate-500";
  if (pct >= 95) return "text-emerald-700";
  if (pct >= 90) return "text-amber-700";
  return "text-red-700";
}

export function LakehouseUnidadeCard({ kpi }: { kpi: KpiUnidade }) {
  const disp = normalizarPct(kpi.disponibilidade_pct);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-slate-50/70 px-4 py-2.5">
        <span className="font-semibold text-navy">{kpi.unidade}</span>
        <span className="text-xs text-muted-foreground">ref. {formatData(kpi.data_referencia)}</span>
      </div>
      <div className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Disponibilidade</div>
        <div className={cn("text-3xl font-semibold tabular", corDisponibilidade(disp))}>{formatPct(disp)}</div>

        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> MTTR
            </dt>
            <dd className="font-semibold tabular">
              {kpi.mttr_horas === null ? "—" : `${formatNumeroFlex(kpi.mttr_horas, 1)} h`}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <ListTodo className="h-3 w-3" /> Backlog
            </dt>
            <dd className="font-semibold tabular">{formatNumero(kpi.backlog_os)} OS</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Risco alto
            </dt>
            <dd className={cn("font-semibold tabular", kpi.equipamentos_risco_alto > 0 && "text-orange-700")}>
              {formatNumero(kpi.equipamentos_risco_alto)} equip.
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" /> Health score médio
          </div>
          <HealthBar score={kpi.health_score_medio} />
        </div>
      </div>
    </Card>
  );
}
