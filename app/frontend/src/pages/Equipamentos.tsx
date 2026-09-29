import { useNavigate } from "react-router-dom";
import { FilterX, Gauge, Sparkles } from "lucide-react";

import { useEquipamentos, useUnidades } from "@/api/hooks";
import type { Risco } from "@/api/types";
import { RiscoBadge, SourceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { FiltroBusca, FiltroSelect } from "@/components/common/Filtros";
import { HealthBar } from "@/components/common/HealthBar";
import { PageHeader } from "@/components/common/PageHeader";
import { useFiltrosUrl } from "@/components/common/useFiltrosUrl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CRITICIDADE_LABEL, RISCO_LABEL, RISCOS, rotulo } from "@/lib/dominio";
import { formatDataHora, formatNumero, formatRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHAVES = ["unidade", "risco", "busca"] as const;

function CriticidadeChip({ c }: { c: string }) {
  const cor = c === "A" ? "bg-red-50 text-red-700 border-red-200" : c === "B" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 text-xs font-semibold", cor)} title={rotulo(CRITICIDADE_LABEL, c)}>
      {c}
    </span>
  );
}

export default function Equipamentos() {
  const navigate = useNavigate();
  const { valores, definir, limpar, temFiltro } = useFiltrosUrl(CHAVES);
  const unidades = useUnidades();
  const risco = valores.risco && valores.risco in RISCO_LABEL ? (valores.risco as Risco) : undefined;

  const { data, isLoading, isError, error, refetch, isFetching } = useEquipamentos({
    unidade: valores.unidade,
    risco,
    busca: valores.busca,
  });

  const itens = data?.itens ?? [];
  const fonte = data?.fonte ?? "CSV_LOCAL";

  return (
    <div>
      <PageHeader
        titulo="Equipamentos"
        descricao="Cadastro de ativos das FPSOs com health score calculado no Lakehouse e OS abertas direto do Lakebase."
        extra={
          data ? (
            <>
              <SourceBadge fonte={fonte} />
              <SourceBadge fonte="OLTP" />
              {data.atualizado_em && (
                <span className="text-xs text-muted-foreground">
                  saúde atualizada em {formatDataHora(data.atualizado_em)} ({formatRelativo(data.atualizado_em)})
                </span>
              )}
            </>
          ) : null
        }
      />

      {data && fonte === "CSV_LOCAL" && (
        <Alert variant="synced" className="mb-4">
          <Sparkles />
          <AlertTitle>Health score chega depois do lab de synced tables</AlertTitle>
          <AlertDescription>
            Por enquanto o cadastro vem de um CSV local. No Passo 5, a tabela de saúde calculada no Lakehouse é sincronizada
            para o Lakebase e as colunas de health score, risco e principal sinal passam a ser preenchidas.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FiltroSelect
          rotulo="Unidade"
          valor={valores.unidade}
          opcoes={unidades.map((u) => ({ valor: u, rotulo: u }))}
          onChange={(v) => definir("unidade", v)}
        />
        <FiltroSelect
          rotulo="Risco"
          valor={risco}
          opcoes={RISCOS.map((r) => ({ valor: r, rotulo: RISCO_LABEL[r] }))}
          onChange={(v) => definir("risco", v)}
          className="w-[150px]"
        />
        <FiltroBusca valor={valores.busca} onChange={(v) => definir("busca", v)} placeholder="Buscar por tag ou nome…" />
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar}>
            <FilterX /> Limpar filtros
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {data ? `${formatNumero(itens.length)} equipamento(s)` : ""}
          {isFetching && !isLoading ? " · atualizando…" : ""}
        </span>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState erro={error} onRetry={() => void refetch()} className="m-4" />
        ) : itens.length === 0 ? (
          <EmptyState
            className="m-4"
            icone={<Gauge />}
            titulo={temFiltro ? "Nenhum equipamento com esses filtros" : "Nenhum equipamento cadastrado"}
            descricao={temFiltro ? "Ajuste ou limpe os filtros para ver mais resultados." : "Carregue o cadastro de equipamentos (seed do backend)."}
            acao={
              temFiltro ? (
                <Button variant="outline" size="sm" onClick={limpar}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-center">Crit.</TableHead>
                <TableHead className="w-[170px]">Health score</TableHead>
                <TableHead>Risco</TableHead>
                <TableHead>Principal sinal</TableHead>
                <TableHead className="text-right">OS abertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((e) => {
                const abrir = () => navigate(`/equipamentos/${encodeURIComponent(e.tag)}`);
                return (
                  <TableRow
                    key={e.tag}
                    className="cursor-pointer"
                    onClick={abrir}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") abrir();
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Abrir ${e.tag}`}
                  >
                    <TableCell className="font-mono text-xs font-semibold text-navy">{e.tag}</TableCell>
                    <TableCell>
                      <div className="font-medium">{e.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {[e.tipo, e.sistema].filter(Boolean).join(" · ")}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{e.unidade}</TableCell>
                    <TableCell className="text-center">
                      <CriticidadeChip c={e.criticidade} />
                    </TableCell>
                    <TableCell>
                      <HealthBar score={e.health_score} risco={e.risco} />
                    </TableCell>
                    <TableCell>
                      <RiscoBadge risco={e.risco} />
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <span className="line-clamp-2 text-sm text-slate-600">{e.principal_sinal ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular",
                          e.os_abertas > 0 ? "bg-blue-50 text-blue-700" : "text-slate-400",
                        )}
                      >
                        {formatNumero(e.os_abertas)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
