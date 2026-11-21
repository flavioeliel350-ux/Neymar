import React from 'react';
import { signOut } from 'firebase/auth';
import { AlertTriangle, LogOut, RotateCw } from 'lucide-react';
import { auth } from '../firebase';

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

  private handleResetSession = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut errors during emergency recovery
    }
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      let friendly = 'Não foi possível concluir a operação no momento.';
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error?.includes('Missing or insufficient permissions')) {
          friendly =
            'Permissão negada pelo servidor. Verifique se sua conta na nuvem está autenticada e com e-mail verificado, ou troque para o Modo Local.';
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
            <div className="w-full flex flex-col gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
                <span>Recarregar Aplicativo</span>
              </button>
              <button
                type="button"
                onClick={() => void this.handleResetSession()}
                className="w-full h-10 rounded-xl bg-[#f2f3ff] hover:bg-[#e2e7ff] text-[#131b2e] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta / Usar Modo Local</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
