import { GitBranch, KeyRound, Layers } from "lucide-react";

import { useMeta } from "@/api/hooks";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODO_AUTH_LABEL, rotulo } from "@/lib/dominio";
import { cn } from "@/lib/utils";

export function EnvBadges() {
  const { data: meta, isLoading, isError } = useMeta();

  if (isLoading) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }
  if (isError || !meta) {
    return (
      <Badge variant="muted" className="h-6">
        ambiente desconhecido
      </Badge>
    );
  }

  const producao = meta.branch === "production";
  const semBranch = !meta.branch;

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "h-6 font-mono text-[11px] font-semibold",
              semBranch
                ? "border-slate-300 bg-slate-100 text-slate-600"
                : producao
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-amber-400 bg-amber-100 text-amber-900 ring-2 ring-amber-200",
            )}
          >
            <GitBranch /> branch: {meta.branch ?? "—"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {semBranch
            ? "Sem branch Lakebase (ex.: Postgres local)."
            : producao
              ? "Conectado à branch de produção do projeto Lakebase."
              : "Conectado a uma branch de desenvolvimento — dados e schema isolados da produção."}
          {meta.ambiente ? ` Ambiente: ${meta.ambiente}.` : ""}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="h-6 border-slate-300 bg-white text-slate-700">
            <KeyRound /> {rotulo(MODO_AUTH_LABEL, meta.modo_auth)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Modo de autenticação do backend no Postgres do Lakebase.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="h-6 border-slate-300 bg-white font-mono text-[11px] text-slate-600">
            <Layers /> schema v{meta.schema_version}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Versão das migrações aplicadas.{" "}
          {meta.loto_habilitado ? "LOTO (bloqueios) habilitado." : "LOTO chega com a migração do Extra 1 (v3)."}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
