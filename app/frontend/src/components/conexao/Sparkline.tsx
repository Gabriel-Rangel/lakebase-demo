import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

import { TooltipGrafico } from "@/components/common/chart-kit";
import { CORES_SERIE } from "@/lib/dominio";
import { formatMs } from "@/lib/format";

export interface Amostra {
  t: number;
  ms: number;
}

export function Sparkline({ amostras, altura = 56 }: { amostras: Amostra[]; altura?: number }) {
  if (amostras.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
        style={{ height: altura }}
      >
        coletando amostras…
      </div>
    );
  }
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={amostras} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
            content={
              <TooltipGrafico
                formatarLabel={() => ""}
                formatarValor={(v) => formatMs(v)}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="ms"
            name="Latência"
            stroke={CORES_SERIE.s1}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
