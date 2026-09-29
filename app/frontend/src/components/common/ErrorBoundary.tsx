import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}
interface State {
  erro: Error | null;
}

/** Evita tela branca na demo: mostra mensagem amigável e permite recarregar. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Erro de renderização:", erro, info.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 rounded-lg border bg-white p-8 text-center shadow-sm">
          <AlertOctagon className="h-10 w-10 text-primary" />
          <h2 className="text-lg font-semibold text-navy">Algo deu errado nesta tela</h2>
          <p className="text-sm text-muted-foreground">
            Um dado inesperado impediu a renderização. Os demais módulos continuam funcionando.
          </p>
          <code className="max-w-full truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {this.state.erro.message}
          </code>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => this.setState({ erro: null })}>
              Tentar de novo
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RotateCw /> Recarregar página
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
