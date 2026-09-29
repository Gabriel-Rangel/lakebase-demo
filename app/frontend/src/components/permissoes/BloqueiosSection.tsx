import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, LockOpen, Plus } from "lucide-react";

import { useAdicionarBloqueio, useRemoverBloqueio } from "@/api/hooks";
import type { Permissao, TipoEnergia } from "@/api/types";
import { CampoForm } from "@/components/common/Campo";
import { usePersona } from "@/components/common/usePersona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_PT_FINAIS, TIPO_ENERGIA_LABEL, TIPOS_ENERGIA, rotulo } from "@/lib/dominio";
import { formatDataHora } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Bloqueios LOTO (Lockout/Tagout) — disponível a partir do schema v3 (Extra 1). */
export function BloqueiosSection({ pt }: { pt: Permissao }) {
  const persona = usePersona();
  const adicionar = useAdicionarBloqueio();
  const remover = useRemoverBloqueio();
  const [ponto, setPonto] = useState("");
  const [energia, setEnergia] = useState<TipoEnergia>("ELETRICA");
  const [cadeado, setCadeado] = useState("");

  const bloqueios = pt.bloqueios ?? [];
  const ativos = bloqueios.filter((b) => !b.removido_em);
  const final = STATUS_PT_FINAIS.includes(pt.status);
  const podeAdicionar = !!persona && ponto.trim().length > 0 && cadeado.trim().length > 0 && !adicionar.isPending;

  const aplicar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!persona || !podeAdicionar) return;
    adicionar.mutate(
      {
        permissaoId: pt.id,
        body: {
          usuario_id: persona.id,
          ponto_isolamento: ponto.trim(),
          tipo_energia: energia,
          cadeado_numero: cadeado.trim(),
        },
      },
      {
        onSuccess: (b) => {
          toast.success(`Bloqueio aplicado — cadeado ${b.cadeado_numero}`);
          setPonto("");
          setCadeado("");
        },
      },
    );
  };

  const retirar = (bloqueioId: number) => {
    if (!persona) return;
    remover.mutate(
      { permissaoId: pt.id, bloqueioId, usuarioId: persona.id },
      { onSuccess: (b) => toast.success(`Bloqueio removido — cadeado ${b.cadeado_numero}`) },
    );
  };

  return (
    <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <Lock className="h-4 w-4" /> Bloqueios LOTO
        </h3>
        <span className="text-xs text-amber-800">
          {ativos.length} ativo(s){pt.requer_loto ? " · esta PT requer bloqueio para iniciar" : ""}
        </span>
      </div>

      {bloqueios.length === 0 ? (
        <p className="text-sm text-amber-900/80">Nenhum bloqueio registrado.</p>
      ) : (
        <ul className="divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
          {bloqueios.map((b) => {
            const removido = !!b.removido_em;
            const removendo = remover.isPending && remover.variables?.bloqueioId === b.id;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                {removido ? (
                  <LockOpen className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <div className={cn("min-w-0 flex-1", removido && "text-slate-400 line-through")}>
                  <div className="font-medium">{b.ponto_isolamento}</div>
                  <div className="text-xs text-muted-foreground">
                    {rotulo(TIPO_ENERGIA_LABEL, b.tipo_energia)} · cadeado{" "}
                    <span className="font-mono font-semibold">{b.cadeado_numero}</span> · {b.aplicado_por_nome} ·{" "}
                    {formatDataHora(b.aplicado_em)}
                  </div>
                </div>
                {removido ? (
                  <span className="text-xs text-slate-500">removido {formatDataHora(b.removido_em)}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retirar(b.id)}
                    disabled={!persona || removendo}
                    className="h-7"
                  >
                    {removendo ? <Loader2 className="animate-spin" /> : <LockOpen />}
                    Remover
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!final && (
        <form onSubmit={aplicar} className="grid gap-3 rounded-md border border-amber-200 bg-white p-3 sm:grid-cols-[1fr_150px_120px_auto] sm:items-end">
          <CampoForm id={`loto-ponto-${pt.id}`} rotulo="Ponto de isolamento" obrigatorio>
            <Input
              id={`loto-ponto-${pt.id}`}
              value={ponto}
              onChange={(e) => setPonto(e.target.value)}
              placeholder="Ex.: Disjuntor CCM-02 gaveta 4"
            />
          </CampoForm>
          <CampoForm id={`loto-energia-${pt.id}`} rotulo="Tipo de energia" obrigatorio>
            <Select value={energia} onValueChange={(v) => setEnergia(v as TipoEnergia)}>
              <SelectTrigger id={`loto-energia-${pt.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ENERGIA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_ENERGIA_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoForm>
          <CampoForm id={`loto-cadeado-${pt.id}`} rotulo="Nº do cadeado" obrigatorio>
            <Input
              id={`loto-cadeado-${pt.id}`}
              value={cadeado}
              onChange={(e) => setCadeado(e.target.value)}
              placeholder="Ex.: C-0417"
              className="font-mono"
            />
          </CampoForm>
          <Button type="submit" disabled={!podeAdicionar} className="sm:mb-0">
            {adicionar.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Aplicar
          </Button>
        </form>
      )}
    </section>
  );
}
