import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SeriesResposta } from "@/api/types";
import { EIXO, GRADE, Legenda, TooltipGrafico } from "@/components/common/chart-kit";
import { CORES_SERIE, STATUS_OS, STATUS_OS_LABEL, rotulo } from "@/lib/dominio";
import { formatData, formatDataCurta, formatNumero } from "@/lib/format";

const fmtInt = (v: number) => formatNumero(v);

export function OsPorDiaChart({ dados }: { dados: SeriesResposta["os_por_dia"] }) {
  return (
    <div className="space-y-2">
      <Legenda
        itens={[
          { cor: CORES_SERIE.s1, rotulo: "Abertas" },
          { cor: CORES_SERIE.s3, rotulo: "Concluídas" },
        ]}
      />
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="gAbertas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CORES_SERIE.s1} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CORES_SERIE.s1} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gConcluidas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CORES_SERIE.s3} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CORES_SERIE.s3} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="data" tickFormatter={(v: string) => formatDataCurta(v)} minTickGap={24} {...EIXO} />
            <YAxis allowDecimals={false} width={40} tickFormatter={fmtInt} {...EIXO} />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={<TooltipGrafico formatarLabel={(l) => formatData(String(l))} formatarValor={fmtInt} />}
            />
            <Area
              type="monotone"
              dataKey="abertas"
              name="Abertas"
              stroke={CORES_SERIE.s1}
              strokeWidth={2}
              fill="url(#gAbertas)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            />
            <Area
              type="monotone"
              dataKey="concluidas"
              name="Concluídas"
              stroke={CORES_SERIE.s3}
              strokeWidth={2}
              fill="url(#gConcluidas)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function OsPorStatusChart({ dados }: { dados: SeriesResposta["os_por_status"] }) {
  // Ordem estável do fluxo (status desconhecidos vão para o fim).
  const ordenados = [...dados]
    .sort((a, b) => {
      const ia = STATUS_OS.indexOf(a.status);
      const ib = STATUS_OS.indexOf(b.status);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map((d) => ({ ...d, rotulo: rotulo(STATUS_OS_LABEL, d.status) }));

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={ordenados} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRADE.stroke} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickFormatter={fmtInt} {...EIXO} />
          <YAxis type="category" dataKey="rotulo" width={110} {...EIXO} />
          <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={<TooltipGrafico formatarValor={fmtInt} />} />
          <Bar dataKey="total" name="Ordens" fill={CORES_SERIE.s1} radius={[0, 4, 4, 0]} maxBarSize={26}>
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v: number) => formatNumero(v)}
              style={{ fill: "#334155", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OsPorUnidadeChart({ dados }: { dados: SeriesResposta["os_por_unidade"] }) {
  return (
    <div className="space-y-2">
      <Legenda
        itens={[
          { cor: CORES_SERIE.s1, rotulo: "Abertas" },
          { cor: CORES_SERIE.s2, rotulo: "Críticas" },
        ]}
      />
      <div className="h-[236px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 16, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid {...GRADE} />
            <XAxis dataKey="unidade" {...EIXO} />
            <YAxis allowDecimals={false} width={40} tickFormatter={fmtInt} {...EIXO} />
            <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={<TooltipGrafico formatarValor={fmtInt} />} />
            <Bar dataKey="abertas" name="Abertas" fill={CORES_SERIE.s1} radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="abertas" position="top" formatter={(v: number) => formatNumero(v)} style={{ fill: "#334155", fontSize: 11 }} />
            </Bar>
            <Bar dataKey="criticas" name="Críticas" fill={CORES_SERIE.s2} radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="criticas" position="top" formatter={(v: number) => formatNumero(v)} style={{ fill: "#334155", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
