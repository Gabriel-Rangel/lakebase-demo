import { useState } from "react";
import { Menu, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

import { EnvBadges } from "./EnvBadges";
import { PersonaSelector } from "./PersonaSelector";
import { SidebarConteudo } from "./Sidebar";

function PollingSwitch() {
  const polling = useAppStore((s) => s.polling);
  const setPolling = useAppStore((s) => s.setPolling);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
          <RefreshCw
            className={cn("h-3.5 w-3.5", polling ? "animate-spin text-primary [animation-duration:3s]" : "text-slate-400")}
          />
          <Label htmlFor="polling" className="hidden cursor-pointer text-xs font-medium text-slate-700 sm:inline">
            Auto 10s
          </Label>
          <Switch id="polling" checked={polling} onCheckedChange={setPolling} aria-label="Atualização automática" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">
        {polling
          ? "Listas e KPIs são atualizados a cada 10 s. Desligue para deixar o compute do Lakebase escalar para zero."
          : "Atualização automática desligada — o compute do Lakebase pode escalar para zero."}
      </TooltipContent>
    </Tooltip>
  );
}

export function Header() {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
        >
          <Menu />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <EnvBadges />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <PollingSwitch />
          <PersonaSelector />
        </div>
      </div>

      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação principal</SheetDescription>
          <SidebarConteudo onNavegar={() => setMenuAberto(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
