import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

import { useCriarOrdem, useEquipamentos } from "@/api/hooks";
import type { Equipamento, Prioridade, TipoOS } from "@/api/types";
import { CampoForm } from "@/components/common/Campo";
import { usePersona } from "@/components/common/usePersona";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAPEL_LABEL, PRIORIDADE_LABEL, PRIORIDADES, TIPO_OS_LABEL, TIPOS_OS, rotulo } from "@/lib/dominio";

interface Form {
  equipamento_tag: string;
  tipo: TipoOS;
  prioridade: Prioridade;
  titulo: string;
  descricao: string;
  data_prevista: string;
}

const VAZIO: Form = {
  equipamento_tag: "",
  tipo: "CORRETIVA",
  prioridade: "P3",
  titulo: "",
  descricao: "",
  data_prevista: "",
};

export function NovaOsDialog({
  open,
  onOpenChange,
  tagInicial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tagInicial?: string;
}) {
  const navigate = useNavigate();
  const persona = usePersona();
  const criar = useCriarOrdem();
  const equipamentos = useEquipamentos({}, { polling: false });
  const [form, setForm] = useState<Form>(VAZIO);
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...VAZIO, equipamento_tag: tagInicial ?? "" });
      setTentou(false);
    }
  }, [open, tagInicial]);

  const porUnidade = useMemo(() => {
    const grupos = new Map<string, Equipamento[]>();
    for (const e of equipamentos.data?.itens ?? []) {
      const lista = grupos.get(e.unidade) ?? [];
      lista.push(e);
      grupos.set(e.unidade, lista);
    }
    return Array.from(grupos.entries())
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([unidade, itens]) => [unidade, itens.sort((a, b) => a.tag.localeCompare(b.tag))] as const);
  }, [equipamentos.data]);

  const erros = {
    equipamento_tag: !form.equipamento_tag ? "Escolha o equipamento." : null,
    titulo: form.titulo.trim().length < 3 ? "Informe um título (mín. 3 caracteres)." : null,
  };
  const valido = !erros.equipamento_tag && !erros.titulo;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (!valido || !persona) return;
    criar.mutate(
      {
        equipamento_tag: form.equipamento_tag,
        tipo: form.tipo,
        prioridade: form.prioridade,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || undefined,
        data_prevista: form.data_prevista || undefined,
        solicitante_id: persona.id,
      },
      {
        onSuccess: (ordem) => {
          onOpenChange(false);
          toast.success(`OS ${ordem.numero} criada no Lakebase`, {
            description: ordem.titulo,
            action: { label: "Abrir OS", onClick: () => navigate(`/ordens/${ordem.id}`) },
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
            <DialogTitle>Nova ordem de serviço</DialogTitle>
            <DialogDescription>
              {persona
                ? `Solicitante: ${persona.nome} (${rotulo(PAPEL_LABEL, persona.papel)}). A OS é gravada direto no Lakebase.`
                : "Selecione uma persona no topo da tela para abrir a OS."}
            </DialogDescription>
          </DialogHeader>

          <CampoForm id="nova-equip" rotulo="Equipamento" obrigatorio erro={tentou ? erros.equipamento_tag : null}>
            <Select value={form.equipamento_tag || undefined} onValueChange={(v) => set("equipamento_tag", v)}>
              <SelectTrigger id="nova-equip" disabled={equipamentos.isLoading}>
                <SelectValue placeholder={equipamentos.isLoading ? "Carregando equipamentos…" : "Selecione o equipamento"} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {porUnidade.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum equipamento disponível.</div>
                )}
                {porUnidade.map(([unidade, itens]) => (
                  <SelectGroup key={unidade}>
                    <SelectLabel>{unidade}</SelectLabel>
                    {itens.map((e) => (
                      <SelectItem key={e.tag} value={e.tag}>
                        <span className="font-mono text-xs">{e.tag}</span> — {e.nome}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </CampoForm>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm id="nova-tipo" rotulo="Tipo" obrigatorio>
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as TipoOS)}>
                <SelectTrigger id="nova-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_OS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_OS_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoForm>
            <CampoForm id="nova-prio" rotulo="Prioridade" obrigatorio>
              <Select value={form.prioridade} onValueChange={(v) => set("prioridade", v as Prioridade)}>
                <SelectTrigger id="nova-prio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoForm>
          </div>

          <CampoForm id="nova-titulo" rotulo="Título" obrigatorio erro={tentou ? erros.titulo : null}>
            <Input
              id="nova-titulo"
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex.: Vibração alta no mancal da bomba de injeção"
              maxLength={200}
              autoFocus
            />
          </CampoForm>

          <CampoForm id="nova-desc" rotulo="Descrição">
            <Textarea
              id="nova-desc"
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="Sintomas, contexto, peças necessárias…"
              rows={3}
            />
          </CampoForm>

          <CampoForm id="nova-data" rotulo="Data prevista" className="sm:w-1/2">
            <Input
              id="nova-data"
              type="date"
              value={form.data_prevista}
              onChange={(e) => set("data_prevista", e.target.value)}
            />
          </CampoForm>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={criar.isPending || !persona}>
              {criar.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Criar OS
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
