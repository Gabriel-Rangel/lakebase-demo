import { Link } from "react-router-dom";

import type { Permissao } from "@/api/types";
import { StatusPtBadge } from "@/components/common/badges";
import { BloqueiosSection } from "@/components/permissoes/BloqueiosSection";
import { RiscoChips } from "@/components/permissoes/RiscoChips";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIPO_PT_LABEL, rotulo } from "@/lib/dominio";
import { formatDataHora } from "@/lib/format";

function Item({ rotulo: r, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{r}</dt>
      <dd className="text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

export function PermissaoDetalheDialog({
  pt,
  aberto,
  carregando,
  erro = false,
  lotoHabilitado,
  onOpenChange,
}: {
  pt: Permissao | null;
  aberto: boolean;
  carregando: boolean;
  erro?: boolean;
  lotoHabilitado: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {!pt ? (
          <DialogHeader>
            <DialogTitle>Permissão de trabalho</DialogTitle>
            <DialogDescription>
              {carregando
                ? "Carregando…"
                : erro
                  ? "Não foi possível carregar as permissões de trabalho agora. Tente novamente em instantes."
                  : "Esta PT não está na lista atual (verifique os filtros)."}
            </DialogDescription>
          </DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{pt.numero}</span>
                <StatusPtBadge status={pt.status} />
                <span className="text-sm font-normal text-muted-foreground">{rotulo(TIPO_PT_LABEL, pt.tipo)}</span>
              </DialogTitle>
              <DialogDescription>
                <Link to={`/ordens/${pt.ordem_id}`} className="font-semibold text-slate-700 hover:text-primary hover:underline">
                  {pt.ordem_numero}
                </Link>{" "}
                · {pt.ordem_titulo} · <span className="font-mono">{pt.equipamento_tag}</span> · {pt.unidade}
              </DialogDescription>
            </DialogHeader>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">Riscos</div>
              <RiscoChips riscos={pt.riscos} />
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">Medidas de controle</div>
              <p className="whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {pt.medidas_controle || "—"}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Item rotulo="Solicitante">{pt.solicitante_nome}</Item>
              <Item rotulo="Criada em">{formatDataHora(pt.criada_em)}</Item>
              <Item rotulo="Validade">{pt.validade_horas} h</Item>
              <Item rotulo="Aprovador">{pt.aprovador_nome ?? "—"}</Item>
              <Item rotulo="Decidida em">{formatDataHora(pt.decidida_em)}</Item>
              <Item rotulo="Janela">
                {pt.validade_inicio ? `${formatDataHora(pt.validade_inicio)} → ${formatDataHora(pt.validade_fim)}` : "—"}
              </Item>
            </dl>

            {pt.comentario_decisao && (
              <p className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm italic text-slate-700">
                “{pt.comentario_decisao}”
              </p>
            )}

            {lotoHabilitado ? (
              <BloqueiosSection pt={pt} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Bloqueios LOTO chegam com a migração do Extra 1 (schema v3) — experimente na branch de dev.
              </p>
            )}

            <div className="text-right font-mono text-[11px] text-muted-foreground">versão {pt.version}</div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
