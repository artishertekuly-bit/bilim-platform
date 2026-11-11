import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-background text-foreground safe-area-top safe-area-bottom">
          <div className="max-w-md w-full bg-card border border-border/80 rounded-2xl p-6 text-center shadow-lg space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold">Қосымшаны жүктеу кезінде қате орын алды</h1>
            <p className="text-sm text-muted-foreground">
              Интернет байланысын тексеріп, қосымшаны қайта іске қосыңыз.
            </p>
            {this.state.error && (
              <pre className="text-xs text-left bg-muted/60 p-3 rounded-lg overflow-x-auto text-muted-foreground/80 font-mono max-h-32">
                {this.state.error.message || String(this.state.error)}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all app-tap"
            >
              <RefreshCw className="w-4 h-4" />
              Қайта жүктеу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
