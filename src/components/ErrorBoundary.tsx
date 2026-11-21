import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Ocorreu um erro inesperado.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ProntoPreço ErrorBoundary:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      let friendly = 'Não foi possível concluir a operação no momento.';
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error?.includes('Missing or insufficient permissions')) {
          friendly =
            'Permissão negada pelo servidor. Verifique se sua conta Google está autenticada e com e-mail verificado.';
        } else if (parsed?.error?.includes('Quota exceeded')) {
          friendly =
            'Cota diária gratuita do Firestore atingida. A cota será redefinida amanhã.';
        }
      } catch {
        // Keep friendly fallback
      }

      return (
        <div className="min-h-screen bg-[#faf8ff] text-[#131b2e] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-[#e2e7ff] p-6 text-center flex flex-col items-center gap-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-[#ffdad6] text-[#ba1a1a] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#131b2e]">
                Erro de Operação
              </h1>
              <p className="text-sm text-[#434655] mt-1">{friendly}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-sm font-bold flex items-center justify-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              <span>Recarregar Aplicativo</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
