import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Lock, ShieldPlus } from "lucide-react";

import { useCriarPermissao, useMeta } from "@/api/hooks";
import type { Ordem, TipoPT } from "@/api/types";
import { CampoForm } from "@/components/common/Campo";
import { usePersona } from "@/components/common/usePersona";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RISCOS_PT, TIPO_PT_LABEL, TIPOS_PT } from "@/lib/dominio";

export function SolicitarPtDialog({
  ordem,
  open,
  onOpenChange,
}: {
  ordem: Ordem;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const persona = usePersona();
  const { data: meta } = useMeta();
  const criar = useCriarPermissao();

  const [tipo, setTipo] = useState<TipoPT>("GERAL");
  const [riscos, setRiscos] = useState<string[]>([]);
  const [medidas, setMedidas] = useState("");
  const [validade, setValidade] = useState("8");
  const [requerLoto, setRequerLoto] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("GERAL");
      setRiscos([]);
      setMedidas("");
      setValidade("8");
      setRequerLoto(false);
    }
  }, [open]);

  const validadeNum = Number(validade);
  const validadeOk = Number.isInteger(validadeNum) && validadeNum >= 1 && validadeNum <= 24;
  const loto = !!meta?.loto_habilitado;

  const alternarRisco = (r: string, marcado: boolean) =>
    setRiscos((atual) => (marcado ? [...atual, r] : atual.filter((x) => x !== r)));

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!persona || !validadeOk) return;
    criar.mutate(
      {
        ordem_id: ordem.id,
        tipo,
        riscos: RISCOS_PT.filter((r) => riscos.includes(r)),
        medidas_controle: medidas.trim() || undefined,
        validade_horas: validadeNum,
        solicitante_id: persona.id,
        ...(loto ? { requer_loto: requerLoto } : {}),
      },
      {
        onSuccess: (pt) => {
          onOpenChange(false);
          toast.success(`PT ${pt.numero} solicitada`, {
            description: `OS ${ordem.numero} agora aguarda a aprovação da PT.`,
            action: { label: "Ver PT", onClick: () => navigate(`/permissoes?pt=${pt.id}`) },
            duration: 10_000,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Solicitar Permissão de Trabalho</DialogTitle>
            <DialogDescription>
              OS <b>{ordem.numero}</b> · {ordem.equipamento_tag} · {ordem.unidade}. A aprovação precisa ser feita por
              Supervisor ou Segurança (diferente do solicitante).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm id="pt-tipo" rotulo="Tipo de PT" obrigatorio>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoPT)}>
                <SelectTrigger id="pt-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_PT.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_PT_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoForm>
            <CampoForm
              id="pt-validade"
              rotulo="Validade (horas)"
              obrigatorio
              erro={!validadeOk ? "Entre 1 e 24 horas." : null}
            >
              <Input
                id="pt-validade"
                type="number"
                min={1}
                max={24}
                step={1}
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
            </CampoForm>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-slate-700">Riscos identificados</legend>
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
              {RISCOS_PT.map((r) => {
                const id = `risco-${r}`;
                return (
                  <div key={r} className="flex items-center gap-2">
                    <Checkbox id={id} checked={riscos.includes(r)} onCheckedChange={(c) => alternarRisco(r, c === true)} />
                    <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                      {r}
                    </Label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <CampoForm id="pt-medidas" rotulo="Medidas de controle">
            <Textarea
              id="pt-medidas"
              value={medidas}
              onChange={(e) => setMedidas(e.target.value)}
              rows={3}
              placeholder="Ex.: Medição de gás contínua, isolamento e despressurização da linha, extintor no local…"
            />
          </CampoForm>

          {loto && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <Checkbox id="pt-loto" checked={requerLoto} onCheckedChange={(c) => setRequerLoto(c === true)} className="mt-0.5" />
              <div>
                <Label htmlFor="pt-loto" className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-amber-900">
                  <Lock className="h-3.5 w-3.5" /> Requer bloqueio LOTO
                </Label>
                <p className="mt-0.5 text-xs text-amber-800">
                  A PT só pode ser iniciada depois de registrar ao menos um bloqueio (Lockout/Tagout).
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending || !persona || !validadeOk}>
              {criar.isPending ? <Loader2 className="animate-spin" /> : <ShieldPlus />}
              Solicitar PT
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
