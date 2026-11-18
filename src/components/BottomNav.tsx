import React from 'react';
import { Store, ScanBarcode, Archive } from 'lucide-react';
import { AppView, ScannerMode } from '../types/product';

interface BottomNavProps {
  activeView: AppView;
  onNavigate: (view: AppView, mode?: ScannerMode) => void;
}

export function BottomNav({ activeView, onNavigate }: BottomNavProps) {
  if (activeView === 'details' || activeView === 'form') {
    return null;
  }

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe bg-[#faf8ff]/95 backdrop-blur-xl border-t border-[#e2e7ff]"
    >
      <div className="grid grid-cols-3 h-15 px-3">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 transition-colors ${
            activeView === 'home'
              ? 'text-[#2563eb] font-bold'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <Store className="w-5 h-5" />
          <span className="text-[11px] leading-tight">Início</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('scanner', 'query')}
          className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 transition-colors ${
            activeView === 'scanner'
              ? 'text-[#2563eb] font-bold'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <ScanBarcode className="w-5 h-5" />
          <span className="text-[11px] leading-tight">Bipar</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('history')}
          className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 transition-colors ${
            activeView === 'history'
              ? 'text-[#2563eb] font-bold'
              : 'text-[#434655] hover:text-[#131b2e]'
          }`}
        >
          <Archive className="w-5 h-5" />
          <span className="text-[11px] leading-tight">Histórico</span>
        </button>
      </div>
    </nav>
  );
}
