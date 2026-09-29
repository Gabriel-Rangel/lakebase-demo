import { useEffect, useRef, useState } from "react";
import { Activity, Database, KeyRound, Layers, RotateCw, Server, ShieldAlert, Timer, Waypoints } from "lucide-react";

import { useConexao, useLatencia } from "@/api/hooks";
import type { Conexao as ConexaoInfo } from "@/api/types";
import { SourceBadge } from "@/components/common/badges";
import { EmptyState, ErrorState } from "@/components/common/estados";
import { PageHeader } from "@/components/common/PageHeader";
import { Arquitetura } from "@/components/conexao/Arquitetura";
import { Sparkline, type Amostra } from "@/components/conexao/Sparkline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MODO_AUTH_LABEL, rotulo } from "@/lib/dominio";
import {
  formatDataHora,
  formatDuracaoTexto,
  formatHora,
  formatMs,
  formatNumero,
  formatNumeroFlex,
  formatRelativo,
  parseData,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

const MAX_AMOSTRAS = 30;

/** Par chave/valor. Nunca trunca: textos longos quebram (mono = break-all, ex.: usuário PG). */
function Kv({ k, children, mono, title }: { k: string; children: React.ReactNode; mono?: boolean; title?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="shrink-0 whitespace-nowrap text-muted-foreground">{k}</dt>
      <dd
        title={title}
        className={cn(
          "min-w-0 text-right font-medium text-slate-800",
          mono ? "break-all font-mono text-xs leading-5" : "break-words",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

function CardInfo({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <span className="text-slate-500 [&_svg]:h-4 [&_svg]:w-4">{icone}</span>
        <CardTitle className="text-sm">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const ESTADOS: Record<string, { rotulo: string; cor: string }> = {
  ACTIVE: { rotulo: "Ativo", cor: "bg-emerald-500" },
  RUNNING: { rotulo: "Rodando", cor: "bg-emerald-500" },
  READY: { rotulo: "Pronto", cor: "bg-emerald-500" },
  HEALTHY: { rotulo: "Saudável", cor: "bg-emerald-500" },
  IDLE: { rotulo: "Ocioso (scale-to-zero)", cor: "bg-slate-400" },
  SUSPENDED: { rotulo: "Suspenso (scale-to-zero)", cor: "bg-slate-400" },
  STOPPED: { rotulo: "Parado", cor: "bg-slate-400" },
  STARTING: { rotulo: "Iniciando", cor: "bg-amber-500" },
  INIT: { rotulo: "Inicializando", cor: "bg-amber-500" },
  PENDING: { rotulo: "Pendente", cor: "bg-amber-500" },
  RESUMING: { rotulo: "Acordando", cor: "bg-amber-500" },
  PROVISIONING: { rotulo: "Provisionando", cor: "bg-amber-500" },
  UPDATING: { rotulo: "Atualizando", cor: "bg-amber-500" },
  DEGRADED: { rotulo: "Degradado", cor: "bg-red-500" },
  FAILED: { rotulo: "Falhou", cor: "bg-red-500" },
  ERROR: { rotulo: "Erro", cor: "bg-red-500" },
};

function estadoInfo(estado: string) {
  const chave = estado.toUpperCase().replace(/^ENDPOINT_STATE_|^STATE_/, "");
  return ESTADOS[chave] ?? { rotulo: estado, cor: "bg-slate-400" };
}

function CardAutenticacao({ c }: { c: ConexaoInfo }) {
  const tk = c.token;
  let minutos = tk?.minutos_restantes ?? null;
  if (minutos === null && tk?.expira_em) {
    const fim = parseData(tk.expira_em);
    if (fim) minutos = Math.max(0, Math.round((fim.getTime() - Date.now()) / 60_000));
  }
  return (
    <CardInfo titulo="Autenticação" icone={<KeyRound />}>
      <dl className="divide-y">
        <Kv k="Modo">
          <Badge variant="outline" className="border-slate-300">
            {rotulo(MODO_AUTH_LABEL, c.modo_auth)}
          </Badge>
        </Kv>
        <Kv k="Usuário PG" mono title={c.usuario_pg}>
          {c.usuario_pg}
        </Kv>
        {tk ? (
          <>
            <Kv k="Token expira em">
              <span className="whitespace-nowrap">{minutos === null ? "—" : `${formatNumero(minutos)} min`}</span>
              {tk.expira_em && (
                <span className="ml-1 whitespace-nowrap text-xs text-muted-foreground">({formatHora(tk.expira_em)})</span>
              )}
            </Kv>
            <Kv k="Renovações">{formatNumero(tk.renovacoes)}</Kv>
          </>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">
            Sem token OAuth — autenticação por senha nativa do Postgres.
          </p>
        )}
      </dl>
      {tk && minutos !== null && (
        <Progress
          value={Math.min(100, (minutos / 60) * 100)}
          className="mt-2 h-1.5"
          indicatorClassName={minutos < 10 ? "bg-amber-500" : "bg-emerald-500"}
          aria-label="Tempo restante do token"
        />
      )}
    </CardInfo>
  );
}

function CardEndpoint({ c }: { c: ConexaoInfo }) {
  const e = c.endpoint_info;
  return (
    <CardInfo titulo="Endpoint (compute)" icone={<Server />}>
      {!e ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> indisponível
          </div>
          <p className="text-xs text-muted-foreground">
            Sem credencial da API Databricks no backend para consultar o endpoint.
          </p>
        </div>
      ) : (
        <dl className="divide-y">
          <Kv k="Estado">
            <span className="inline-flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", estadoInfo(e.estado).cor)} />
              {estadoInfo(e.estado).rotulo}
            </span>
          </Kv>
          <Kv k="Autoscaling">
            {formatNumeroFlex(e.min_cu, 2)} – {formatNumeroFlex(e.max_cu, 2)} CU
          </Kv>
          <Kv k="Suspende após">{formatDuracaoTexto(e.suspend_timeout)}</Kv>
          <Kv k="Último ativo">
            {e.ultimo_ativo ? (
              <span title={formatDataHora(e.ultimo_ativo)}>{formatRelativo(e.ultimo_ativo)}</span>
            ) : (
              "—"
            )}
          </Kv>
        </dl>
      )}
    </CardInfo>
  );
}

function CardPool({ c }: { c: ConexaoInfo }) {
  const p = c.pool;
  const emUso = Math.max(0, p.tamanho - p.disponiveis);
  return (
    <CardInfo titulo="Pool de conexões" icone={<Waypoints />}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-navy tabular">
          {formatNumero(emUso)}
          <span className="text-sm font-normal text-muted-foreground"> / {formatNumero(p.max)} em uso</span>
        </span>
      </div>
      <Progress value={p.max > 0 ? (emUso / p.max) * 100 : 0} className="mb-2 h-1.5" indicatorClassName="bg-blue-600" />
      <dl className="grid grid-cols-2 gap-x-4 text-sm">
        <Kv k="Abertas">{formatNumero(p.tamanho)}</Kv>
        <Kv k="Livres">{formatNumero(p.disponiveis)}</Kv>
        <Kv k="Em espera">
          <span className={p.em_espera > 0 ? "text-amber-700" : ""}>{formatNumero(p.em_espera)}</span>
        </Kv>
        <Kv k="Mín/Máx">
          {formatNumero(p.min)}/{formatNumero(p.max)}
        </Kv>
        <Kv k="Criadas">{formatNumero(p.conexoes_criadas)}</Kv>
        <Kv k="Erros">
          <span className={p.erros > 0 ? "text-red-700" : ""}>{formatNumero(p.erros)}</span>
        </Kv>
      </dl>
    </CardInfo>
  );
}

function CardLatencia({ inicial }: { inicial: number }) {
  const polling = useAppStore((s) => s.polling);
  const latencia = useLatencia();
  const [amostras, setAmostras] = useState<Amostra[]>(() => [{ t: Date.now(), ms: inicial }]);
  const ultimaAtualizacao = useRef(0);

  useEffect(() => {
    const d = latencia.data;
    if (!d || latencia.dataUpdatedAt === ultimaAtualizacao.current) return;
    ultimaAtualizacao.current = latencia.dataUpdatedAt;
    if (typeof d.latencia_ms !== "number") return;
    setAmostras((a) => [...a, { t: latencia.dataUpdatedAt, ms: d.latencia_ms }].slice(-MAX_AMOSTRAS));
  }, [latencia.data, latencia.dataUpdatedAt]);

  const atual = latencia.data?.latencia_ms ?? inicial;
  const valores = amostras.map((a) => a.ms);
  const media = valores.length ? valores.reduce((x, y) => x + y, 0) / valores.length : null;
  const max = valores.length ? Math.max(...valores) : null;

  return (
    <CardInfo titulo="Latência (SELECT 1)" icone={<Activity />}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "whitespace-nowrap text-3xl font-semibold tabular",
            latencia.isError ? "text-slate-400" : atual > 200 ? "text-amber-700" : "text-navy",
          )}
        >
          {formatMs(atual)}
        </span>
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {latencia.isError ? "falhou" : polling ? "a cada 5 s" : "polling desligado"}
        </span>
      </div>
      <div className="mt-2">
        <Sparkline amostras={amostras} altura={96} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>
          {amostras.length} amostra(s) · média {formatMs(media)}
        </span>
        <span>máx {formatMs(max)}</span>
      </div>
      {!polling && (
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void latencia.refetch()}>
          <RotateCw className={latencia.isFetching ? "animate-spin" : ""} /> Medir agora
        </Button>
      )}
    </CardInfo>
  );
}

function CardPostgres({ c }: { c: ConexaoInfo }) {
  return (
    <CardInfo titulo="Postgres" icone={<Database />}>
      <dl className="divide-y">
        <Kv k="Versão">
          <span title={c.versao_postgres}>{c.versao_postgres.split(" on ")[0] || "—"}</span>
        </Kv>
        <Kv k="Database" mono>
          {c.database}
        </Kv>
        <Kv k="Schema version">
          <Badge variant="outline" className="font-mono">
            v{c.schema_version}
          </Badge>
        </Kv>
        <Kv k="Porta">{c.porta}</Kv>
      </dl>
    </CardInfo>
  );
}

export default function Conexao() {
  const { data: c, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useConexao();

  const tabelas = [...(c?.tabelas ?? [])].sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || a.schema.localeCompare(b.schema) || a.tabela.localeCompare(b.tabela),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Conexão Lakebase"
        descricao="Prova de que este app roda fora do Databricks e fala Postgres direto com o Lakebase."
        extra={dataUpdatedAt ? <span className="text-xs text-muted-foreground">consultado às {formatHora(new Date(dataUpdatedAt).toISOString())}</span> : null}
        acoes={
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RotateCw className={isFetching ? "animate-spin" : ""} /> Atualizar
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-40 flex-1" />
            <Skeleton className="h-40 flex-1" />
            <Skeleton className="h-40 flex-1" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48 md:col-span-2" />
            <Skeleton className="h-48" />
          </div>
        </div>
      ) : isError || !c ? (
        <ErrorState erro={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {!c.privilegios_analitico_ok && (
            <Alert variant="warning">
              <ShieldAlert />
              <AlertTitle>Permissão pendente no schema analitico</AlertTitle>
              <AlertDescription>
                O app ainda não tem SELECT no schema analitico — rode a célula de GRANT do Passo 5
              </AlertDescription>
            </Alert>
          )}

          <Arquitetura c={c} />

          {/* lg: linha 1 = auth, endpoint, pool; linha 2 = latência (2 colunas) + postgres */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <CardAutenticacao c={c} />
            <CardEndpoint c={c} />
            <CardPool c={c} />
            <div className="md:col-span-2">
              <CardLatencia inicial={c.latencia_ms} />
            </div>
            <CardPostgres c={c} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-500" /> Tabelas no Lakebase
              </CardTitle>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Timer className="h-3.5 w-3.5" /> linhas estimadas (pg_class.reltuples)
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {tabelas.length === 0 ? (
                <EmptyState className="m-5 mt-0" compacto titulo="Nenhuma tabela visível para o usuário do app" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Schema</TableHead>
                      <TableHead>Tabela</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Dono</TableHead>
                      <TableHead className="text-right">Linhas estimadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabelas.map((t) => (
                      <TableRow key={`${t.schema}.${t.tabela}`}>
                        <TableCell className="font-mono text-xs">{t.schema}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-navy">{t.tabela}</TableCell>
                        <TableCell>
                          <SourceBadge fonte={t.tipo === "SYNCED" ? "LAKEHOUSE_SYNCED" : "OLTP"} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{t.dono}</TableCell>
                        <TableCell className="text-right tabular">
                          {t.linhas_estimadas < 0 ? "—" : formatNumero(t.linhas_estimadas)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
