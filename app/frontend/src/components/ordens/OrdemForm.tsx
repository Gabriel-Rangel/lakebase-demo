import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Save, Undo2 } from "lucide-react";

import { useAtualizarOrdem, useUsuarios } from "@/api/hooks";
import type { AtualizarOrdemBody, Ordem, Prioridade } from "@/api/types";
import { CampoForm } from "@/components/common/Campo";
import { usePersona } from "@/components/common/usePersona";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAPEL_LABEL, PRIORIDADE_LABEL, PRIORIDADES, STATUS_OS_FINAIS, rotulo } from "@/lib/dominio";
import { paraInputData } from "@/lib/format";

interface Campos {
  titulo: string;
  descricao: string;
  prioridade: Prioridade;
  responsavel_id: number | null;
  data_prevista: string;
}

function camposDe(o: Ordem): Campos {
  return {
    titulo: o.titulo ?? "",
    descricao: o.descricao ?? "",
    prioridade: o.prioridade,
    responsavel_id: o.responsavel_id,
    data_prevista: paraInputData(o.data_prevista),
  };
}

/**
 * Formulário de edição. Montado com key={ordem.version}: quando a versão muda
 * (salvou, ou 409 e recarregou), o formulário reinicia com os dados do servidor.
 */
export function OrdemForm({ ordem }: { ordem: Ordem }) {
  const persona = usePersona();
  const usuarios = useUsuarios();
  const salvar = useAtualizarOrdem(ordem.id);
  const original = useMemo(() => camposDe(ordem), [ordem]);
  const [f, setF] = useState<Campos>(original);
  const somenteLeitura = STATUS_OS_FINAIS.includes(ordem.status);

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => setF((x) => ({ ...x, [k]: v }));

  const mudancas = useMemo(() => {
    const m: Omit<AtualizarOrdemBody, "version" | "usuario_id"> = {};
    if (f.titulo.trim() !== original.titulo.trim()) m.titulo = f.titulo.trim();
    if (f.descricao.trim() !== original.descricao.trim()) m.descricao = f.descricao.trim();
    if (f.prioridade !== original.prioridade) m.prioridade = f.prioridade;
    if (f.responsavel_id !== null && f.responsavel_id !== original.responsavel_id) m.responsavel_id = f.responsavel_id;
    // Limpar a data não é suportado pelo contrato (campo opcional): só enviamos datas preenchidas.
    if (f.data_prevista && f.data_prevista !== original.data_prevista) m.data_prevista = f.data_prevista;
    return m;
  }, [f, original]);

  const sujo = Object.keys(mudancas).length > 0;
  const tituloInvalido = f.titulo.trim().length < 3;

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!persona || !sujo || tituloInvalido) return;
    salvar.mutate(
      { version: ordem.version, usuario_id: persona.id, ...mudancas },
      {
        onSuccess: (o) => toast.success(`OS ${o.numero} salva`, { description: `Nova versão: ${o.version}` }),
      },
    );
  };

  const responsaveis = usuarios.data ?? [];

  return (
    <form onSubmit={enviar} className="space-y-4">
      {somenteLeitura && (
        <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <Lock className="h-3.5 w-3.5" /> OS finalizada — somente leitura.
        </div>
      )}
      <CampoForm id="os-titulo" rotulo="Título" obrigatorio erro={tituloInvalido ? "Mínimo de 3 caracteres." : null}>
        <Input
          id="os-titulo"
          value={f.titulo}
          onChange={(e) => set("titulo", e.target.value)}
          disabled={somenteLeitura}
          maxLength={200}
        />
      </CampoForm>
      <CampoForm id="os-desc" rotulo="Descrição">
        <Textarea
          id="os-desc"
          value={f.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          rows={4}
          disabled={somenteLeitura}
          placeholder="Sem descrição"
        />
      </CampoForm>
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoForm id="os-prio" rotulo="Prioridade">
          <Select value={f.prioridade} onValueChange={(v) => set("prioridade", v as Prioridade)} disabled={somenteLeitura}>
            <SelectTrigger id="os-prio">
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
        <CampoForm id="os-data" rotulo="Data prevista">
          <Input
            id="os-data"
            type="date"
            value={f.data_prevista}
            onChange={(e) => set("data_prevista", e.target.value)}
            disabled={somenteLeitura}
          />
        </CampoForm>
        <CampoForm id="os-resp" rotulo="Responsável">
          <Select
            value={f.responsavel_id !== null ? String(f.responsavel_id) : undefined}
            onValueChange={(v) => set("responsavel_id", Number(v))}
            disabled={somenteLeitura || usuarios.isLoading}
          >
            <SelectTrigger id="os-resp">
              <SelectValue placeholder={ordem.responsavel_nome ?? "Sem responsável"} />
            </SelectTrigger>
            <SelectContent>
              {responsaveis.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.nome} <span className="text-muted-foreground">· {rotulo(PAPEL_LABEL, u.papel)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CampoForm>
      </div>

      {!somenteLeitura && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <span className="mr-auto text-xs text-muted-foreground">
            Editando a <b className="text-slate-700">versão {ordem.version}</b> — se outra pessoa salvar antes, o Lakebase
            recusa (lock otimista).
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={!sujo || salvar.isPending} onClick={() => setF(original)}>
            <Undo2 /> Descartar
          </Button>
          <Button type="submit" disabled={!sujo || tituloInvalido || salvar.isPending || !persona}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar alterações
          </Button>
        </div>
      )}
    </form>
  );
}
