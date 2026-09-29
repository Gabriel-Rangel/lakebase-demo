import { useNavigate } from "react-router-dom";
import { ShieldCheck, Sparkles } from "lucide-react";

import type { OrdemResumo } from "@/api/types";
import { PrioridadeBadge, StatusOsBadge } from "@/components/common/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_PT_COR, STATUS_PT_LABEL, TIPO_OS_LABEL, TIPO_PT_LABEL, rotulo } from "@/lib/dominio";
import { formatData, formatRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OrigemIcone({ origem }: { origem: OrdemResumo["origem"] }) {
  if (origem !== "PREDITIVA_LAKEHOUSE") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-purple-700">
          <Sparkles className="h-3.5 w-3.5" aria-label="Preditiva (Lakehouse)" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Criada a partir da predição do Lakehouse (health score)</TooltipContent>
    </Tooltip>
  );
}

export function PtAtivaChip({ pt }: { pt: OrdemResumo["pt_ativa"] }) {
  if (!pt) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            STATUS_PT_COR[pt.status] ?? "border-slate-200 bg-slate-50",
          )}
        >
          <ShieldCheck className="h-3 w-3" />
          {pt.numero}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        PT {rotulo(STATUS_PT_LABEL, pt.status).toLowerCase()} · {rotulo(TIPO_PT_LABEL, pt.tipo)}
      </TooltipContent>
    </Tooltip>
  );
}

export function OrdensTabela({
  itens,
  mostrarEquipamento = true,
}: {
  itens: OrdemResumo[];
  mostrarEquipamento?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Título</TableHead>
          {mostrarEquipamento && <TableHead>Equipamento</TableHead>}
          <TableHead>Tipo</TableHead>
          <TableHead>Prioridade</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PT ativa</TableHead>
          <TableHead>Responsável</TableHead>
          <TableHead>Abertura</TableHead>
          <TableHead>Prevista</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map((o) => {
          const abrir = () => navigate(`/ordens/${o.id}`);
          return (
            <TableRow
              key={o.id}
              className="cursor-pointer"
              onClick={abrir}
              onKeyDown={(e) => {
                if (e.key === "Enter") abrir();
              }}
              tabIndex={0}
              role="link"
              aria-label={`Abrir ${o.numero}`}
            >
              <TableCell className="whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold text-navy">{o.numero}</span>
                  <OrigemIcone origem={o.origem} />
                </div>
              </TableCell>
              <TableCell className="max-w-[320px]">
                <span className="line-clamp-2 font-medium">{o.titulo}</span>
              </TableCell>
              {mostrarEquipamento && (
                <TableCell className="whitespace-nowrap">
                  <div className="font-mono text-xs">{o.equipamento_tag}</div>
                  <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {[o.equipamento_nome, o.unidade].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap text-sm">{rotulo(TIPO_OS_LABEL, o.tipo)}</TableCell>
              <TableCell>
                <PrioridadeBadge prioridade={o.prioridade} curta />
              </TableCell>
              <TableCell>
                <StatusOsBadge status={o.status} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <PtAtivaChip pt={o.pt_ativa} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{o.responsavel_nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="whitespace-nowrap text-sm" title={formatRelativo(o.data_abertura)}>
                {formatData(o.data_abertura)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">{formatData(o.data_prevista)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
