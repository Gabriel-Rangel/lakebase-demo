import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PontoTendencia } from "@/api/types";
import { EIXO, GRADE, TooltipGrafico } from "@/components/common/chart-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CORES_SERIE } from "@/lib/dominio";
import { formatDataAuto, formatDataCurta, formatNumeroFlex } from "@/lib/format";

type Metrica = "vibracao_mm_s" | "temperatura_c" | "pressao_bar" | "corrente_a";

const METRICAS: { chave: Metrica; rotulo: string; unidade: string }[] = [
  { chave: "vibracao_mm_s", rotulo: "Vibração", unidade: "mm/s" },
  { chave: "temperatura_c", rotulo: "Temperatura", unidade: "°C" },
  { chave: "pressao_bar", rotulo: "Pressão", unidade: "bar" },
  { chave: "corrente_a", rotulo: "Corrente", unidade: "A" },
];

function resumo(valores: number[]) {
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  return { min, max, media, ultimo: v[v.length - 1] };
}

export function TendenciaChart({ dados }: { dados: PontoTendencia[] }) {
  const [metrica, setMetrica] = useState<Metrica>("vibracao_mm_s");
  const m = METRICAS.find((x) => x.chave === metrica) ?? METRICAS[0];
  const pontos = dados.map((d) => ({ data: d.data, valor: typeof d[metrica] === "number" ? d[metrica] : null }));
  const r = resumo(pontos.map((p) => p.valor as number));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={metrica} onValueChange={(v) => setMetrica(v as Metrica)}>
          <TabsList>
            {METRICAS.map((x) => (
              <TabsTrigger key={x.chave} value={x.chave}>
                {x.rotulo} <span className="text-xs text-muted-foreground">{x.unidade}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {r && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              último <b className="text-slate-800 tabular">{formatNumeroFlex(r.ultimo, 2)}</b>
            </span>
            <span>
              média <b className="text-slate-800 tabular">{formatNumeroFlex(r.media, 2)}</b>
            </span>
            <span>
              máx <b className="text-slate-800 tabular">{formatNumeroFlex(r.max, 2)}</b> {m.unidade}
            </span>
          </div>
        )}
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="gTendencia" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CORES_SERIE.s1} stopOpacity={0.2} />
                <stop offset="100%" stopColor={CORES_SERIE.s1} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" tickFormatter={(v: string) => formatDataCurta(v)} minTickGap={28} {...EIXO} />
            <YAxis
              width={48}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => formatNumeroFlex(v, 1)}
              {...EIXO}
            />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={
                <TooltipGrafico
                  formatarLabel={(l) => formatDataAuto(String(l))}
                  formatarValor={(v) => formatNumeroFlex(v, 2)}
                  unidade={m.unidade}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="valor"
              name={m.rotulo}
              stroke={CORES_SERIE.s1}
              strokeWidth={2}
              fill="url(#gTendencia)"
              connectNulls
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
