import { Outlet, useLocation } from "react-router-dom";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatusBanner } from "./StatusBanner";

export function AppLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <StatusBanner />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-8">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
