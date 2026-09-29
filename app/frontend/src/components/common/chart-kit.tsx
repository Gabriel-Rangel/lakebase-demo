import { formatNumeroFlex } from "@/lib/format";

/** Estilo recessivo para eixos e grade (dataviz: grade/eixos discretos). */
export const EIXO = {
  stroke: "#94a3b8",
  tick: { fill: "#64748b", fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: "#e2e8f0" },
} as const;

export const GRADE = { stroke: "#eef1f4", vertical: false } as const;

interface ItemPayload {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

interface TooltipGraficoProps {
  active?: boolean;
  payload?: ItemPayload[];
  label?: string | number;
  formatarLabel?: (label: string | number) => string;
  formatarValor?: (valor: number) => string;
  unidade?: string;
}

/** Tooltip pt-BR: título + linhas com marcador da série e valor em tinta de texto. */
export function TooltipGrafico({
  active,
  payload,
  label,
  formatarLabel,
  formatarValor,
  unidade,
}: TooltipGraficoProps) {
  if (!active || !payload || payload.length === 0) return null;
  const titulo = label !== undefined && formatarLabel ? formatarLabel(label) : label;
  return (
    <div className="min-w-[140px] rounded-md border bg-white px-3 py-2 text-xs shadow-lg">
      {titulo !== undefined && titulo !== "" && <div className="mb-1.5 font-semibold text-slate-800">{titulo}</div>}
      <div className="space-y-1">
        {payload.map((p, i) => {
          const v = typeof p.value === "number" ? p.value : Number(p.value);
          const texto = Number.isFinite(v) ? (formatarValor ? formatarValor(v) : formatNumeroFlex(v, 2)) : "—";
          return (
            <div key={`${String(p.dataKey)}-${i}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
              <span className="font-semibold text-slate-900 tabular">
                {texto}
                {unidade ? ` ${unidade}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legenda manual (sempre presente com ≥ 2 séries). */
export function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
      {itens.map((i) => (
        <span key={i.rotulo} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.cor }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}
