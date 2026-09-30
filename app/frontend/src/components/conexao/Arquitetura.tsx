import type { ReactNode } from "react";
import { ArrowLeftRight, ArrowRight, Boxes, Container, Database, Laptop } from "lucide-react";

import type { Conexao } from "@/api/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MODO_AUTH_LABEL, rotulo } from "@/lib/dominio";
import { cn } from "@/lib/utils";

function Caixa({
  icone,
  titulo,
  subtitulo,
  children,
  destaque,
}: {
  icone: ReactNode;
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  destaque: string;
}) {
  return (
    <div className={cn("min-w-0 flex-1 rounded-lg border-2 bg-white p-4 shadow-sm", destaque)}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 [&_svg]:h-5 [&_svg]:w-5">
          {icone}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-navy">{titulo}</div>
          <div className="text-xs text-muted-foreground">{subtitulo}</div>
        </div>
      </div>
      <dl className="space-y-1.5 text-xs">{children}</dl>
    </div>
  );
}

function Par({
  k,
  v,
  mono = true,
  quebrar = false,
}: {
  k: string;
  v: string | null | undefined;
  mono?: boolean;
  /** Quebra em vez de truncar (ex.: usuário PG, que nunca deve ser cortado). */
  quebrar?: boolean;
}) {
  const texto = v ?? "—";
  if (quebrar) {
    return (
      <div className="grid grid-cols-[72px_1fr] gap-2">
        <dt className="text-muted-foreground">{k}</dt>
        <dd className={cn("break-all text-slate-800", mono && "font-mono")} title={texto}>
          {texto}
        </dd>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <Tooltip>
        <TooltipTrigger asChild>
          <dd className={cn("truncate text-slate-800", mono && "font-mono")}>{texto}</dd>
        </TooltipTrigger>
        {texto.length > 28 && <TooltipContent className="max-w-md break-all font-mono">{texto}</TooltipContent>}
      </Tooltip>
    </div>
  );
}

function Seta({ linhas, icone }: { linhas: string[]; icone: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center lg:w-32">
      <span className="rotate-90 text-slate-400 lg:rotate-0 [&_svg]:h-6 [&_svg]:w-6">{icone}</span>
      {linhas.map((l) => (
        <span key={l} className="text-[11px] font-medium leading-tight text-slate-500">
          {l}
        </span>
      ))}
    </div>
  );
}

export function Arquitetura({ c }: { c: Conexao }) {
  const synced = c.tabelas.filter((t) => t.tipo === "SYNCED");
  const docker = c.rodando_em === "docker";
  return (
    <div className="flex flex-col items-stretch gap-1 lg:flex-row">
      <Caixa
        icone={docker ? <Container className="text-sky-600" /> : <Laptop className="text-sky-600" />}
        titulo={docker ? "Seu servidor · Docker" : "Seu computador · processo local"}
        subtitulo={docker ? "container Docker, fora do Databricks" : "processo local, fora do Databricks"}
        destaque="border-sky-200"
      >
        <Par k="hostname" v={c.hostname} />
        <Par k="rodando em" v={docker ? "Docker" : "processo local"} mono={false} />
        <Par k="usuário PG" v={c.usuario_pg} quebrar />
      </Caixa>

      <Seta
        icone={<ArrowRight />}
        linhas={[
          docker ? "do container" : "do processo local",
          "Postgres · TLS",
          rotulo(MODO_AUTH_LABEL, c.modo_auth),
        ]}
      />

      <Caixa
        icone={<Database className="text-blue-600" />}
        titulo="Lakebase"
        subtitulo="Postgres gerenciado · OLTP"
        destaque="border-blue-200"
      >
        <Par k="host" v={`${c.host}:${c.porta}`} />
        <Par k="projeto" v={c.projeto} />
        <Par k="branch" v={c.branch} />
        <Par k="endpoint" v={c.endpoint} />
      </Caixa>

      <Seta icone={<ArrowLeftRight />} linhas={["synced tables", "Unity Catalog"]} />

      <Caixa
        icone={<Boxes className="text-purple-600" />}
        titulo="Unity Catalog / Lakehouse"
        subtitulo="gold → synced tables no Lakebase"
        destaque={c.privilegios_analitico_ok ? "border-purple-200" : "border-amber-300"}
      >
        <Par k="synced" v={`${synced.length} tabela(s)`} mono={false} />
        {synced.slice(0, 3).map((t) => (
          <Par key={`${t.schema}.${t.tabela}`} k={t.schema} v={t.tabela} />
        ))}
        {synced.length === 0 && (
          <p className="text-muted-foreground">Nenhuma synced table ainda — chegam no Passo 5.</p>
        )}
        <Par k="SELECT" v={c.privilegios_analitico_ok ? "ok nas synced tables" : "pendente (GRANT)"} mono={false} />
      </Caixa>
    </div>
  );
}
