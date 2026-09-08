import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Algo deu errado nesta tela</h1>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            O erro foi registrado no console. Você pode tentar recarregar esta seção.
          </p>
        </div>
        <pre className="max-w-md overflow-x-auto rounded-md bg-slate-100 p-3 text-left text-xs text-slate-600">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.handleReset}>Tentar de novo</Button>
          <Button onClick={() => window.location.assign('/')}>Voltar ao início</Button>
        </div>
      </div>
    );
  }
}
