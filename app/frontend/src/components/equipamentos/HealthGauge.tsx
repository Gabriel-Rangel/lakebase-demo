import type { Risco } from "@/api/types";
import { RISCO_COR, riscoPorScore } from "@/lib/dominio";
import { formatNumero } from "@/lib/format";

/** Gauge semicircular 0–100 para o health score (sem dado: arco cinza e "—"). */
export function HealthGauge({ score, risco }: { score: number | null; risco: Risco | null }) {
  const r = 70;
  const cx = 90;
  const cy = 86;
  const comprimento = Math.PI * r;
  const valor = score === null ? 0 : Math.max(0, Math.min(100, score));
  const faixa = (risco && RISCO_COR[risco] ? risco : riscoPorScore(score)) ?? null;
  const cor = faixa ? RISCO_COR[faixa].hex : "#cbd5e1";
  const arco = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <svg viewBox="0 0 180 104" className="h-auto w-full max-w-[220px]" role="img" aria-label={`Health score ${score ?? "indisponível"}`}>
      <path d={arco} fill="none" stroke="#e2e8f0" strokeWidth={14} strokeLinecap="round" />
      {score !== null && (
        <path
          d={arco}
          fill="none"
          stroke={cor}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${(valor / 100) * comprimento} ${comprimento}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      )}
      <text x={cx} y={cy - 12} textAnchor="middle" className="fill-navy" style={{ fontSize: 34, fontWeight: 700 }}>
        {score === null ? "—" : formatNumero(score)}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" style={{ fontSize: 11, fill: "#64748b" }}>
        health score / 100
      </text>
      <text x={cx - r} y={cy + 16} textAnchor="middle" style={{ fontSize: 9, fill: "#94a3b8" }}>
        0
      </text>
      <text x={cx + r} y={cy + 16} textAnchor="middle" style={{ fontSize: 9, fill: "#94a3b8" }}>
        100
      </text>
    </svg>
  );
}
