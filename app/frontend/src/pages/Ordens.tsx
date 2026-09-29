import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, FilterX, Plus } from "lucide-react";

import { useOrdens, useUnidades } from "@/api/hooks";
import type { Prioridade, StatusOS } from "@/api/types";
import { SourceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { FiltroBusca, FiltroSelect } from "@/components/common/Filtros";
import { PageHeader } from "@/components/common/PageHeader";
import { useFiltrosUrl } from "@/components/common/useFiltrosUrl";
import { usePersona } from "@/components/common/usePersona";
import { NovaOsDialog } from "@/components/ordens/NovaOsDialog";
import { OrdensTabela } from "@/components/ordens/OrdensTabela";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRIORIDADE_LABEL, PRIORIDADES, STATUS_OS, STATUS_OS_LABEL } from "@/lib/dominio";
import { formatNumero } from "@/lib/format";

const POR_PAGINA = 25;
const CHAVES = ["status", "unidade", "prioridade", "busca"] as const;

export default function Ordens() {
  const persona = usePersona();
  const [novaAberta, setNovaAberta] = useState(false);
  const { valores, definir, limpar, pagina, temFiltro } = useFiltrosUrl(CHAVES);
  const unidades = useUnidades();

  const status = valores.status && valores.status in STATUS_OS_LABEL ? (valores.status as StatusOS) : undefined;
  const prioridade =
    valores.prioridade && valores.prioridade in PRIORIDADE_LABEL ? (valores.prioridade as Prioridade) : undefined;

  const { data, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useOrdens({
    status,
    unidade: valores.unidade,
    prioridade,
    busca: valores.busca,
    limite: POR_PAGINA,
    offset: (pagina - 1) * POR_PAGINA,
  });

  const itens = data?.itens ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const inicio = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const fim = Math.min(total, (pagina - 1) * POR_PAGINA + itens.length);

  // Se a página atual ficou vazia (ex.: OS mudaram de status), volta para a última válida.
  useEffect(() => {
    if (data && !isPlaceholderData && itens.length === 0 && total > 0 && pagina > totalPaginas) {
      definir("pagina", totalPaginas > 1 ? String(totalPaginas) : undefined);
    }
  }, [data, isPlaceholderData, itens.length, total, pagina, totalPaginas, definir]);

  return (
    <div>
      <PageHeader
        titulo="Ordens de Serviço"
        descricao="Transações OLTP gravadas direto no Lakebase (Postgres) — com lock otimista por versão."
        extra={<SourceBadge fonte="OLTP" />}
        acoes={
          <Button onClick={() => setNovaAberta(true)} disabled={!persona} title={!persona ? "Selecione uma persona" : undefined}>
            <Plus /> Nova OS
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FiltroSelect
          rotulo="Status"
          valor={status}
          opcoes={STATUS_OS.map((s) => ({ valor: s, rotulo: STATUS_OS_LABEL[s] }))}
          onChange={(v) => definir("status", v)}
        />
        <FiltroSelect
          rotulo="Unidade"
          valor={valores.unidade}
          opcoes={unidades.map((u) => ({ valor: u, rotulo: u }))}
          onChange={(v) => definir("unidade", v)}
        />
        <FiltroSelect
          rotulo="Prioridade"
          valor={prioridade}
          opcoes={PRIORIDADES.map((p) => ({ valor: p, rotulo: PRIORIDADE_LABEL[p] }))}
          onChange={(v) => definir("prioridade", v)}
        />
        <FiltroBusca valor={valores.busca} onChange={(v) => definir("busca", v)} placeholder="Buscar por número, título ou tag…" />
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar}>
            <FilterX /> Limpar filtros
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState erro={error} onRetry={() => void refetch()} className="m-4" />
        ) : itens.length === 0 ? (
          <EmptyState
            className="m-4"
            icone={<ClipboardList />}
            titulo={temFiltro ? "Nenhuma OS com esses filtros" : "Nenhuma ordem de serviço ainda"}
            descricao={
              temFiltro
                ? "Ajuste ou limpe os filtros."
                : "Crie a primeira OS — ela será gravada no Lakebase e aparece aqui na hora."
            }
            acao={
              temFiltro ? (
                <Button variant="outline" size="sm" onClick={limpar}>
                  Limpar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setNovaAberta(true)} disabled={!persona}>
                  <Plus /> Nova OS
                </Button>
              )
            }
          />
        ) : (
          <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <OrdensTabela itens={itens} />
          </div>
        )}

        {data && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/60 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">
              Mostrando <b className="text-slate-800 tabular">{formatNumero(inicio)}</b>–
              <b className="text-slate-800 tabular">{formatNumero(fim)}</b> de{" "}
              <b className="text-slate-800 tabular">{formatNumero(total)}</b>
              {isFetching && " · atualizando…"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => definir("pagina", String(pagina - 1))}
              >
                <ChevronLeft /> Anterior
              </Button>
              <span className="text-xs text-muted-foreground tabular">
                Página {formatNumero(pagina)} de {formatNumero(totalPaginas)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas}
                onClick={() => definir("pagina", String(pagina + 1))}
              >
                Próxima <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <NovaOsDialog open={novaAberta} onOpenChange={setNovaAberta} />
    </div>
  );
}
