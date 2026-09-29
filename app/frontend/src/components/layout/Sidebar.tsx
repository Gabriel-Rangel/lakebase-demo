import { NavLink } from "react-router-dom";
import { ClipboardList, Container, Gauge, Laptop, LayoutDashboard, PlugZap, ShieldCheck } from "lucide-react";

import { useConexaoEmCache } from "@/api/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Painel", icone: LayoutDashboard, end: true },
  { to: "/equipamentos", label: "Equipamentos", icone: Gauge, end: false },
  { to: "/ordens", label: "Ordens de Serviço", icone: ClipboardList, end: false },
  { to: "/permissoes", label: "Permissões de Trabalho", icone: ShieldCheck, end: false },
  { to: "/conexao", label: "Conexão Lakebase", icone: PlugZap, end: false },
] as const;

export function Logo() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
        <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
          <path d="M6 22h20v3H6z" fill="#FF3621" />
          <path
            d="M9 22V12l4-3v13M15 22V8h4v14M21 22v-8l3-2v10"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-white">Brickhouse Energia</div>
        <div className="text-xs text-slate-400">Manutenção Offshore</div>
      </div>
    </div>
  );
}

export function SidebarConteudo({ onNavegar }: { onNavegar?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-navy text-slate-300">
      <Logo />
      <div className="mx-5 mb-3 h-px bg-white/10" />
      <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavegar}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-brand text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white",
              )
            }
          >
            <item.icone className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <RodapeExecucao />
    </div>
  );
}

/** "Rodando fora do Databricks" + onde (Docker / processo local) quando /api/conexao já está em cache. */
function RodapeExecucao() {
  const { data } = useConexaoEmCache();
  const onde = data?.rodando_em === "docker" ? "Docker" : data?.rodando_em === "host" ? "processo local" : null;
  const Icone = data?.rodando_em === "host" ? Laptop : Container;
  return (
    <div className="m-3 flex items-center gap-2.5 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-slate-300">
      <Icone className="h-4 w-4 shrink-0 text-sky-300" />
      <div className="leading-tight">
        <div>Rodando fora do Databricks</div>
        {onde && <div className="mt-0.5 font-medium text-white">{onde}</div>}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    // O <aside> estica até a altura total do conteúdo (fundo navy contínuo ao rolar);
    // o miolo fica sticky com a altura da viewport.
    <aside className="hidden w-64 shrink-0 self-stretch bg-navy lg:block">
      <div className="sticky top-0 h-screen w-64">
        <SidebarConteudo />
      </div>
    </aside>
  );
}
