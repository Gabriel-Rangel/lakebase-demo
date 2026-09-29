import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";

const Painel = lazy(() => import("@/pages/Painel"));
const Equipamentos = lazy(() => import("@/pages/Equipamentos"));
const EquipamentoDetalhe = lazy(() => import("@/pages/EquipamentoDetalhe"));
const Ordens = lazy(() => import("@/pages/Ordens"));
const OrdemDetalhe = lazy(() => import("@/pages/OrdemDetalhe"));
const Permissoes = lazy(() => import("@/pages/Permissoes"));
const Conexao = lazy(() => import("@/pages/Conexao"));
const NaoEncontrada = lazy(() => import("@/pages/NaoEncontrada"));

function CarregandoPagina() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                index
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <Painel />
                  </Suspense>
                }
              />
              <Route
                path="equipamentos"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <Equipamentos />
                  </Suspense>
                }
              />
              <Route
                path="equipamentos/:tag"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <EquipamentoDetalhe />
                  </Suspense>
                }
              />
              <Route
                path="ordens"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <Ordens />
                  </Suspense>
                }
              />
              <Route
                path="ordens/:id"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <OrdemDetalhe />
                  </Suspense>
                }
              />
              <Route
                path="permissoes"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <Permissoes />
                  </Suspense>
                }
              />
              <Route
                path="conexao"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <Conexao />
                  </Suspense>
                }
              />
              <Route
                path="*"
                element={
                  <Suspense fallback={<CarregandoPagina />}>
                    <NaoEncontrada />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
