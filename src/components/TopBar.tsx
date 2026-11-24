import React from 'react';
import {
  ArrowLeft,
  Cloud,
  HardDrive,
  Lock,
  ScanBarcode,
  UserCircle2,
} from 'lucide-react';
import { AppView, ScannerMode, StoreOperator } from '../types/product';

interface TopBarProps {
  view: AppView;
  title?: string;
  syncMode: 'cloud' | 'local' | 'none';
  activeOperator?: StoreOperator | null;
  canEditPrices: boolean;
  onNavigate: (view: AppView, mode?: ScannerMode) => void;
  onBack?: () => void;
  onOpenAccount: () => void;
  onLockRegister: () => void;
}

export function TopBar({
  view,
  title,
  syncMode,
  activeOperator,
  canEditPrices,
  onNavigate,
  onBack,
  onOpenAccount,
  onLockRegister,
}: TopBarProps) {
  const isUnlocked = syncMode !== 'none' && Boolean(activeOperator);
  const isStackView = view === 'details' || view === 'form';

  const operatorLabel = activeOperator
    ? `${activeOperator.code} · ${activeOperator.role === 'manager' ? 'Gerente' : 'Operador'}`
    : syncMode !== 'none'
      ? 'Caixa Bloqueado'
      : 'Entrar na Loja';

  if (isStackView && isUnlocked) {
    return (
      <header className="sticky top-0 z-40 w-full pt-safe bg-[#faf8ff]/90 backdrop-blur-xl border-b border-[#e2e7ff]">
        <div className="max-w-6xl mx-auto h-14 px-3 md:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-lg text-[#131b2e] hover:bg-[#eaedff] active:scale-95 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col min-w-0">
              <h1 className="text-base font-bold text-[#131b2e] truncate">
                {title || 'Detalhes'}
              </h1>
              <span className="text-[11px] font-medium text-[#434655] truncate">
                {syncMode === 'cloud'
                  ? `Nuvem Sincronizada · ${activeOperator?.code || 'Op. 01'}`
                  : `Conta Local Offline · ${activeOperator?.code || 'Op. 01'}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onLockRegister}
              aria-label="Bloquear caixa"
              title="Bloquear caixa e exigir PIN"
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#eaedff] hover:bg-[#ffdad6] hover:text-[#93000a] text-[#434655] transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onOpenAccount}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] text-[#131b2e] text-xs font-bold whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
            >
              {syncMode === 'cloud' ? (
                <Cloud className="w-4 h-4 text-[#006e2d]" />
              ) : (
                <HardDrive className="w-4 h-4 text-[#006058]" />
              )}
              <span>{activeOperator?.code || 'Op. 01'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('scanner', 'query')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:bg-[#004ac6] active:brightness-90 transition-all min-h-[40px] cursor-pointer"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Bipar Produto</span>
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 w-full pt-safe bg-[#faf8ff]/90 backdrop-blur-xl border-b border-[#e2e7ff]">
      <div className="max-w-6xl mx-auto h-14 px-3 md:px-6 flex items-center justify-between gap-4">
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

        {isUnlocked && (
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#434655]">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
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
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
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
              className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
                view === 'history'
                  ? 'text-[#004ac6] border-[#2563eb]'
                  : 'border-transparent hover:text-[#131b2e]'
              }`}
            >
              Histórico &amp; Catálogo
            </button>
            {canEditPrices && (
              <button
                type="button"
                onClick={() => onNavigate('form')}
                className="py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 border-transparent hover:text-[#131b2e] cursor-pointer"
              >
                Novo Cadastro
              </button>
            )}
          </nav>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {isUnlocked && (
            <button
              type="button"
              onClick={onLockRegister}
              aria-label="Bloquear caixa"
              title="Bloquear caixa / trocar perfil"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#eaedff] hover:bg-[#ffdad6] hover:text-[#93000a] text-[#434655] text-xs font-bold whitespace-nowrap shrink-0 transition-colors min-h-[40px] cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Bloquear</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAccount}
            disabled={syncMode !== 'none' && !activeOperator}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all min-h-[40px] ${
              syncMode !== 'none' && !activeOperator
                ? 'bg-[#fef3c7] text-[#92400e] cursor-default'
                : syncMode === 'cloud'
                  ? 'bg-[#dcfce7] text-[#005320] hover:bg-[#bbf7d0] cursor-pointer'
                  : syncMode === 'local'
                    ? 'bg-[#e6fffa] text-[#006058] hover:bg-[#ccfbf1] cursor-pointer'
                    : 'bg-[#eaedff] text-[#004ac6] hover:bg-[#dae2fd] cursor-pointer'
            }`}
          >
            {syncMode !== 'none' && !activeOperator ? (
              <Lock className="w-4 h-4 shrink-0" />
            ) : syncMode === 'cloud' ? (
              <Cloud className="w-4 h-4 shrink-0" />
            ) : syncMode === 'local' ? (
              <HardDrive className="w-4 h-4 shrink-0" />
            ) : (
              <UserCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{operatorLabel}</span>
          </button>

          {isUnlocked && (
            <button
              type="button"
              onClick={() => onNavigate('scanner', 'query')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563eb] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:bg-[#004ac6] active:brightness-90 transition-all min-h-[40px] cursor-pointer"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Bipar Produto</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
