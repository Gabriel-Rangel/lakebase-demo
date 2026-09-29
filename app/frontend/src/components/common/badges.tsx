import { Database, FileSpreadsheet, RefreshCw } from "lucide-react";

import type { FonteAnalitica, Prioridade, Risco, StatusOS, StatusPT } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import {
  PRIORIDADE_COR,
  PRIORIDADE_LABEL,
  RISCO_COR,
  RISCO_LABEL,
  STATUS_OS_COR,
  STATUS_OS_LABEL,
  STATUS_PT_COR,
  STATUS_PT_LABEL,
  rotulo,
} from "@/lib/dominio";
import { cn } from "@/lib/utils";

// ---------- Fonte do dado (usado de forma consistente em todo o app) ----------

export type FonteDado = "OLTP" | FonteAnalitica;

export function SourceBadge({ fonte, className }: { fonte: FonteDado; className?: string }) {
  if (fonte === "OLTP") {
    return (
      <Badge variant="outline" className={cn("border-blue-200 bg-blue-50 text-blue-700", className)}>
        <Database /> Lakebase · OLTP
      </Badge>
    );
  }
  if (fonte === "LAKEHOUSE_SYNCED") {
    return (
      <Badge variant="outline" className={cn("border-purple-200 bg-purple-50 text-purple-700", className)}>
        <RefreshCw /> Lakehouse → Lakebase · synced
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("border-slate-300 bg-slate-100 text-slate-600", className)}>
      <FileSpreadsheet /> CSV local
    </Badge>
  );
}

// ---------- Domínio ----------

export function RiscoBadge({ risco, className }: { risco: Risco | null | undefined; className?: string }) {
  if (!risco || !RISCO_COR[risco]) {
    return <span className={cn("text-sm text-muted-foreground", className)}>—</span>;
  }
  return (
    <Badge variant="outline" className={cn("font-semibold", RISCO_COR[risco].badge, className)}>
      {RISCO_LABEL[risco]}
    </Badge>
  );
}

export function StatusOsBadge({ status, className }: { status: StatusOS; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_OS_COR[status] ?? "", className)}>
      {rotulo(STATUS_OS_LABEL, status)}
    </Badge>
  );
}

export function StatusPtBadge({ status, className }: { status: StatusPT; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_PT_COR[status] ?? "", className)}>
      {rotulo(STATUS_PT_LABEL, status)}
    </Badge>
  );
}

export function PrioridadeBadge({
  prioridade,
  curta = false,
  className,
}: {
  prioridade: Prioridade;
  curta?: boolean;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("font-semibold", PRIORIDADE_COR[prioridade] ?? "", className)}>
      {curta ? prioridade : rotulo(PRIORIDADE_LABEL, prioridade)}
    </Badge>
  );
}
