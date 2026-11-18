import React from 'react';
import { ArrowLeft, ScanBarcode } from 'lucide-react';
import { AppView, ScannerMode } from '../types/product';

interface TopBarProps {
  view: AppView;
  title?: string;
  onNavigate: (view: AppView, mode?: ScannerMode) => void;
  onBack?: () => void;
}

export function TopBar({ view, title, onNavigate, onBack }: TopBarProps) {
  const isStackView = view === 'details' || view === 'form';

  if (isStackView) {
    return (
      <header className="sticky top-0 z-40 w-full pt-safe bg-[#faf8ff]/90 backdrop-blur-xl border-b border-[#e2e7ff]">
        <div className="max-w-6xl mx-auto h-14 px-3 md:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg text-[#131b2e] hover:bg-[#eaedff] active:scale-95 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-base font-bold text-[#131b2e] truncate">
                {title || 'Detalhes'}
              </h1>
              <span className="text-[11px] font-medium text-[#434655] truncate">
                Banco Local · Armazenamento Offline
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('scanner', 'query')}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:bg-[#004ac6] active:brightness-90 transition-all"
          >
            <ScanBarcode className="w-4 h-4" />
            <span>Bipar Produto</span>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 w-full pt-safe bg-[#faf8ff]/90 backdrop-blur-xl border-b border-[#e2e7ff]">
      <div className="max-w-6xl mx-auto h-14 px-3 md:px-6 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] rounded-lg"
        >
          <span className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center text-white shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-[#131b2e] whitespace-nowrap shrink-0">
            ProntoPreço
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#434655]">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              view === 'home'
                ? 'text-[#004ac6] border-[#2563eb]'
                : 'border-transparent hover:text-[#131b2e]'
            }`}
          >
            Início
          </button>
          <button
            type="button"
            onClick={() => onNavigate('scanner', 'query')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              view === 'scanner'
                ? 'text-[#004ac6] border-[#2563eb]'
                : 'border-transparent hover:text-[#131b2e]'
            }`}
          >
            Bipar Código
          </button>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              view === 'history'
                ? 'text-[#004ac6] border-[#2563eb]'
                : 'border-transparent hover:text-[#131b2e]'
            }`}
          >
            Histórico &amp; Catálogo
          </button>
          <button
            type="button"
            onClick={() => onNavigate('form')}
            className="py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 border-transparent hover:text-[#131b2e]"
          >
            Novo Cadastro
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('scanner', 'query')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:bg-[#004ac6] active:brightness-90 transition-all min-h-[40px]"
          >
            <ScanBarcode className="w-4 h-4" />
            <span>Bipar Produto</span>
          </button>
        </div>
      </div>
    </header>
  );
}
