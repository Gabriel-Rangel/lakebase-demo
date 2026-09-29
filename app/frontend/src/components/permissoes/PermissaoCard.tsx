import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, Lock, Maximize2, Play, Square, User, XCircle } from "lucide-react";

import type { Papel, Permissao } from "@/api/types";
import { StatusPtBadge } from "@/components/common/badges";
import { RiscoChips } from "@/components/permissoes/RiscoChips";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PAPEIS_APROVADORES, STATUS_PT_FINAIS, TIPO_PT_LABEL, rotulo } from "@/lib/dominio";
import { formatDataHora, formatRelativo, parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AcaoCard = "aprovar" | "rejeitar" | "iniciar" | "encerrar" | "detalhes";

function Validade({ pt }: { pt: Permissao }) {
  const fim = parseData(pt.validade_fim);
  const ativa = pt.status === "APROVADA" || pt.status === "EM_EXECUCAO";
  if (fim && ativa) {
    const vencida = fim.getTime() < Date.now();
    return (
      <span className={cn("flex items-center gap-1", vencida ? "font-semibold text-red-700" : "text-slate-600")}>
        <Clock className="h-3 w-3" />
        {vencida ? `vencida ${formatRelativo(pt.validade_fim)}` : `válida até ${formatDataHora(pt.validade_fim)}`}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-slate-600">
      <Clock className="h-3 w-3" /> validade {pt.validade_horas} h
    </span>
  );
}

export function PermissaoCard({
  pt,
  papel,
  lotoHabilitado,
  ocupado,
  onAcao,
}: {
  pt: Permissao;
  papel: Papel | null;
  lotoHabilitado: boolean;
  ocupado: boolean;
  onAcao: (acao: AcaoCard, pt: Permissao) => void;
}) {
  const aprovador = papel !== null && PAPEIS_APROVADORES.includes(papel);
  const final = STATUS_PT_FINAIS.includes(pt.status);
  const bloqueiosAtivos = (pt.bloqueios ?? []).filter((b) => !b.removido_em).length;
  const faltaLoto = lotoHabilitado && pt.requer_loto && bloqueiosAtivos === 0;

  return (
    <Card className={cn("p-3 text-sm shadow-sm transition-shadow hover:shadow-md", final && "bg-slate-50/70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-navy">{pt.numero}</span>
            {final && <StatusPtBadge status={pt.status} className="text-[10px]" />}
          </div>
          <Link
            to={`/ordens/${pt.ordem_id}`}
            className="mt-0.5 block text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            <span className="font-mono">{pt.ordem_numero}</span> · <span className="line-clamp-1 inline">{pt.ordem_titulo}</span>
          </Link>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onAcao("detalhes", pt)}
          aria-label={`Detalhes da ${pt.numero}`}
          title="Detalhes"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="font-mono font-semibold text-slate-700">{pt.equipamento_tag}</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-600">{pt.unidade}</span>
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-700">{rotulo(TIPO_PT_LABEL, pt.tipo)}</span>
      </div>

      <div className="mt-2">
        <RiscoChips riscos={pt.riscos} max={3} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1 text-slate-600">
          <User className="h-3 w-3" /> {pt.solicitante_nome}
        </span>
        <Validade pt={pt} />
      </div>

      {pt.aprovador_nome && (
        <div className="mt-1 text-xs text-muted-foreground">
          {pt.status === "REJEITADA" ? "Rejeitada" : "Aprovada"} por <b className="text-slate-700">{pt.aprovador_nome}</b>
          {pt.comentario_decisao ? <span className="italic"> — “{pt.comentario_decisao}”</span> : null}
        </div>
      )}

      {lotoHabilitado && (pt.requer_loto || bloqueiosAtivos > 0) && (
        <button
          type="button"
          onClick={() => onAcao("detalhes", pt)}
          className={cn(
            "mt-2 flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-xs font-medium",
            faltaLoto ? "border-amber-400 bg-amber-100 text-amber-900" : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <Lock className="h-3 w-3" />
          LOTO · {bloqueiosAtivos} bloqueio(s) ativo(s)
          {faltaLoto && pt.status === "APROVADA" ? " — registre antes de iniciar" : ""}
        </button>
      )}

      {!final && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5">
          {pt.status === "SOLICITADA" &&
            (aprovador ? (
              <>
                <Button size="sm" variant="success" disabled={ocupado} onClick={() => onAcao("aprovar", pt)}>
                  <CheckCircle2 /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={ocupado}
                  onClick={() => onAcao("rejeitar", pt)}
                >
                  <XCircle /> Rejeitar
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Aguardando aprovação de Supervisor ou Segurança</span>
            ))}
          {pt.status === "APROVADA" && (
            <Button size="sm" disabled={ocupado || papel === null} onClick={() => onAcao("iniciar", pt)}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Play />} Iniciar
            </Button>
          )}
          {pt.status === "EM_EXECUCAO" && (
            <Button size="sm" variant="secondary" disabled={ocupado || papel === null} onClick={() => onAcao("encerrar", pt)}>
              <Square /> Encerrar
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
