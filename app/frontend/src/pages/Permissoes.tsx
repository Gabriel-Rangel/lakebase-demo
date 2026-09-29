import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FilterX, ShieldCheck } from "lucide-react";

import { ApiError } from "@/api/client";
import { useAcaoPermissao, useMeta, usePermissoes, useUnidades } from "@/api/hooks";
import type { Permissao, StatusPT } from "@/api/types";
import { SourceBadge } from "@/components/common/badges";
import { CampoForm } from "@/components/common/Campo";
import { ConfirmarDialog } from "@/components/common/ConfirmarDialog";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { FiltroBusca, FiltroSelect } from "@/components/common/Filtros";
import { PageHeader } from "@/components/common/PageHeader";
import { useFiltrosUrl } from "@/components/common/useFiltrosUrl";
import { usePersona } from "@/components/common/usePersona";
import { PermissaoCard, type AcaoCard } from "@/components/permissoes/PermissaoCard";
import { PermissaoDetalheDialog } from "@/components/permissoes/PermissaoDetalheDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PAPEIS_APROVADORES, PAPEL_LABEL, rotulo } from "@/lib/dominio";
import { parseData } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Coluna {
  chave: string;
  titulo: string;
  status: StatusPT[];
  cor: string;
  ordenar: (a: Permissao, b: Permissao) => number;
}

const t = (s: string | null | undefined) => parseData(s)?.getTime() ?? 0;

const COLUNAS: Coluna[] = [
  {
    chave: "solicitadas",
    titulo: "Solicitadas",
    status: ["SOLICITADA"],
    cor: "border-t-amber-400",
    ordenar: (a, b) => t(a.criada_em) - t(b.criada_em),
  },
  {
    chave: "aprovadas",
    titulo: "Aprovadas",
    status: ["APROVADA"],
    cor: "border-t-sky-500",
    ordenar: (a, b) => t(a.decidida_em ?? a.criada_em) - t(b.decidida_em ?? b.criada_em),
  },
  {
    chave: "execucao",
    titulo: "Em execução",
    status: ["EM_EXECUCAO"],
    cor: "border-t-teal-500",
    ordenar: (a, b) => t(a.validade_fim) - t(b.validade_fim),
  },
  {
    chave: "finalizadas",
    titulo: "Finalizadas",
    status: ["ENCERRADA", "REJEITADA", "CANCELADA"],
    cor: "border-t-slate-400",
    ordenar: (a, b) => t(b.decidida_em ?? b.criada_em) - t(a.decidida_em ?? a.criada_em),
  },
];

const LIMITE_FINALIZADAS = 12;

type Dialogo = { tipo: "aprovar" | "rejeitar" | "encerrar"; pt: Permissao } | null;

export default function Permissoes() {
  const persona = usePersona();
  const { data: meta } = useMeta();
  const loto = !!meta?.loto_habilitado;
  const unidades = useUnidades();
  const { valores, definir, temFiltro } = useFiltrosUrl(["unidade", "busca"] as const);
  const [params, setParams] = useSearchParams();
  const ptSelecionada = Number(params.get("pt") ?? "") || null;

  const { data, isLoading, isError, error, refetch, isFetching } = usePermissoes({ unidade: valores.unidade });
  const acao = useAcaoPermissao();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [horas, setHoras] = useState("");
  const [verTodasFinalizadas, setVerTodasFinalizadas] = useState(false);

  const itens = useMemo(() => {
    const todos = data?.itens ?? [];
    const busca = valores.busca?.toLowerCase().trim();
    if (!busca) return todos;
    return todos.filter((p) =>
      [p.numero, p.ordem_numero, p.ordem_titulo, p.equipamento_tag, p.solicitante_nome]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(busca)),
    );
  }, [data, valores.busca]);

  const porColuna = useMemo(
    () =>
      COLUNAS.map((c) => ({
        coluna: c,
        itens: itens.filter((p) => c.status.includes(p.status)).sort(c.ordenar),
      })),
    [itens],
  );

  const abrirDetalhe = (id: number | null) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        if (id === null) novo.delete("pt");
        else novo.set("pt", String(id));
        return novo;
      },
      { replace: true },
    );

  const executar = (
    pt: Permissao,
    tipo: "aprovar" | "rejeitar" | "iniciar" | "encerrar",
    extra: { comentario?: string; horas_indisponivel?: number } = {},
  ) => {
    if (!persona) return;
    const base = { id: pt.id, usuario_id: persona.id, version: pt.version };
    const sucesso: Record<typeof tipo, string> = {
      aprovar: `PT ${pt.numero} aprovada`,
      rejeitar: `PT ${pt.numero} rejeitada`,
      iniciar: `PT ${pt.numero} iniciada — OS ${pt.ordem_numero} em execução`,
      encerrar: `PT ${pt.numero} encerrada — OS ${pt.ordem_numero} concluída`,
    };
    const variaveis =
      tipo === "aprovar"
        ? { acao: "aprovar" as const, ...base, comentario: extra.comentario }
        : tipo === "rejeitar"
          ? { acao: "rejeitar" as const, ...base, comentario: extra.comentario ?? "" }
          : tipo === "iniciar"
            ? { acao: "iniciar" as const, ...base }
            : {
                acao: "encerrar" as const,
                ...base,
                comentario: extra.comentario,
                horas_indisponivel: extra.horas_indisponivel,
              };
    acao.mutate(variaveis, {
      onSuccess: () => {
        setDialogo(null);
        toast.success(sucesso[tipo]);
      },
      // 409: dados recarregados (fecha); 422: mantém aberto para o usuário ajustar.
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) setDialogo(null);
      },
    });
  };

  const onAcao = (tipo: AcaoCard, pt: Permissao) => {
    if (tipo === "detalhes") return abrirDetalhe(pt.id);
    if (tipo === "iniciar") return executar(pt, "iniciar");
    if (tipo === "encerrar") setHoras("");
    setDialogo({ tipo, pt });
  };

  const horasNum = horas.trim() === "" ? undefined : Number(horas.replace(",", "."));
  const horasOk = horasNum === undefined || (Number.isFinite(horasNum) && horasNum >= 0);

  const ptDetalhe = ptSelecionada ? (data?.itens ?? []).find((p) => p.id === ptSelecionada) ?? null : null;
  const aprovador = persona ? PAPEIS_APROVADORES.includes(persona.papel) : false;

  return (
    <div>
      <PageHeader
        titulo="Permissões de Trabalho"
        descricao="Fluxo de PT com segregação de funções: quem solicita não aprova, e só uma PT ativa por OS."
        extra={
          <>
            <SourceBadge fonte="OLTP" />
            {persona && (
              <span className={cn("text-xs", aprovador ? "text-emerald-700" : "text-muted-foreground")}>
                Atuando como <b>{persona.nome}</b> ({rotulo(PAPEL_LABEL, persona.papel)})
                {aprovador ? " — pode aprovar/rejeitar" : " — não aprova PTs"}
              </span>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FiltroSelect
          rotulo="Unidade"
          valor={valores.unidade}
          opcoes={unidades.map((u) => ({ valor: u, rotulo: u }))}
          onChange={(v) => definir("unidade", v)}
        />
        <FiltroBusca valor={valores.busca} onChange={(v) => definir("busca", v)} placeholder="Buscar PT, OS, tag ou solicitante…" />
        {temFiltro && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              definir("unidade", undefined);
              definir("busca", undefined);
            }}
          >
            <FilterX /> Limpar filtros
          </Button>
        )}
        {isFetching && !isLoading && <span className="ml-auto text-xs text-muted-foreground">atualizando…</span>}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((c) => (
            <div key={c.chave} className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState erro={error} onRetry={() => void refetch()} />
      ) : (data?.itens ?? []).length === 0 ? (
        <EmptyState
          icone={<ShieldCheck />}
          titulo="Nenhuma permissão de trabalho ainda"
          descricao="Abra uma OS, planeje e use “Solicitar PT” no detalhe da OS."
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {porColuna.map(({ coluna, itens: lista }) => {
            const finalizadas = coluna.chave === "finalizadas";
            const visiveis = finalizadas && !verTodasFinalizadas ? lista.slice(0, LIMITE_FINALIZADAS) : lista;
            return (
              <section key={coluna.chave} className={cn("rounded-lg border border-t-4 bg-slate-100/60", coluna.cor)}>
                <header className="flex items-center justify-between px-3 py-2.5">
                  <h2 className="text-sm font-semibold text-navy">{coluna.titulo}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm tabular">
                    {lista.length}
                  </span>
                </header>
                <div className="space-y-2.5 px-2.5 pb-2.5">
                  {visiveis.length === 0 ? (
                    <p className="rounded-md border border-dashed bg-white/60 px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma PT
                    </p>
                  ) : (
                    visiveis.map((pt) => (
                      <PermissaoCard
                        key={pt.id}
                        pt={pt}
                        papel={persona?.papel ?? null}
                        lotoHabilitado={loto}
                        ocupado={acao.isPending && acao.variables?.id === pt.id}
                        onAcao={onAcao}
                      />
                    ))
                  )}
                  {finalizadas && lista.length > LIMITE_FINALIZADAS && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setVerTodasFinalizadas((v) => !v)}>
                      {verTodasFinalizadas ? "Mostrar menos" : `Mostrar todas (${lista.length})`}
                    </Button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Aprovar */}
      <ConfirmarDialog
        open={dialogo?.tipo === "aprovar"}
        onOpenChange={(v) => !v && setDialogo(null)}
        titulo={`Aprovar ${dialogo?.pt.numero ?? ""}`}
        descricao={
          dialogo ? (
            <>
              OS {dialogo.pt.ordem_numero} · {dialogo.pt.equipamento_tag}. Solicitada por{" "}
              <b>{dialogo.pt.solicitante_nome}</b>. Só é permitida uma PT ativa por OS.
            </>
          ) : undefined
        }
        rotuloConfirmar="Aprovar PT"
        variante="success"
        comentario="opcional"
        placeholderComentario="Ex.: Medição de gás OK, área isolada."
        carregando={acao.isPending}
        onConfirmar={(c) => dialogo && executar(dialogo.pt, "aprovar", { comentario: c })}
      />

      {/* Rejeitar */}
      <ConfirmarDialog
        open={dialogo?.tipo === "rejeitar"}
        onOpenChange={(v) => !v && setDialogo(null)}
        titulo={`Rejeitar ${dialogo?.pt.numero ?? ""}`}
        descricao="Informe o motivo da rejeição — ele fica registrado no histórico da OS."
        rotuloConfirmar="Rejeitar PT"
        variante="destructive"
        comentario="obrigatorio"
        placeholderComentario="Ex.: Faltam medidas de controle para gás inflamável."
        carregando={acao.isPending}
        onConfirmar={(c) => dialogo && executar(dialogo.pt, "rejeitar", { comentario: c })}
      />

      {/* Encerrar */}
      <ConfirmarDialog
        open={dialogo?.tipo === "encerrar"}
        onOpenChange={(v) => !v && setDialogo(null)}
        titulo={`Encerrar ${dialogo?.pt.numero ?? ""}`}
        descricao={dialogo ? `A OS ${dialogo.pt.ordem_numero} será concluída na mesma transação.` : undefined}
        rotuloConfirmar="Encerrar PT"
        comentario="opcional"
        placeholderComentario="Ex.: Rolamento substituído, vibração normalizada."
        carregando={acao.isPending}
        podeConfirmar={horasOk}
        onConfirmar={(c) => dialogo && executar(dialogo.pt, "encerrar", { comentario: c, horas_indisponivel: horasNum })}
      >
        <CampoForm
          id="horas-indisp"
          rotulo="Horas de indisponibilidade do equipamento"
          erro={!horasOk ? "Informe um número maior ou igual a zero." : null}
          ajuda="Alimenta MTTR e disponibilidade no Lakehouse."
        >
          <Input
            id="horas-indisp"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            placeholder="Ex.: 4,5"
            className="w-40"
          />
        </CampoForm>
      </ConfirmarDialog>

      <PermissaoDetalheDialog
        pt={ptDetalhe}
        aberto={ptSelecionada !== null}
        carregando={isLoading}
        erro={isError}
        lotoHabilitado={loto}
        onOpenChange={(v) => !v && abrirDetalhe(null)}
      />
    </div>
  );
}
