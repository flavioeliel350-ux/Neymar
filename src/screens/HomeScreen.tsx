import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Barcode,
  Cloud,
  Database,
  History,
  Lock,
  PlusCircle,
  QrCode,
  Search,
  Tag,
} from 'lucide-react';
import { AppView, Product, ScanLog, ScannerMode, StoreOperator } from '../types/product';
import { formatBRL, formatRelativeTime, triggerHaptic } from '../utils/feedback';
import { ProductVisual } from '../components/ProductVisual';

interface HomeScreenProps {
  products: Product[];
  logs: ScanLog[];
  todayScans: number;
  syncMode: 'cloud' | 'offline';
  storeName?: string;
  activeOperator?: StoreOperator | null;
  canEditPrices: boolean;
  onStartScan: (mode: ScannerMode) => void;
  onOpenProduct: (product: Product) => void;
  onRegisterBarcode: (barcode: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenAccount: () => void;
}

export function HomeScreen({
  products,
  logs,
  todayScans,
  syncMode,
  storeName,
  activeOperator,
  canEditPrices,
  onStartScan,
  onOpenProduct,
  onRegisterBarcode,
  onNavigate,
  onOpenAccount,
}: HomeScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const quickMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.barcode.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q),
      )
      .slice(0, 5);
  }, [products, searchQuery]);

  const isNumericEanCandidate = useMemo(() => {
    const trimmed = searchQuery.trim();
    return /^\d{6,14}$/.test(trimmed);
  }, [searchQuery]);

  const handleManualSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    const exact = products.find((p) => p.barcode === trimmed);
    if (exact) {
      triggerHaptic(30);
      onOpenProduct(exact);
      return;
    }

    if (quickMatches.length === 1) {
      triggerHaptic(30);
      onOpenProduct(quickMatches[0]);
      return;
    }

    if (isNumericEanCandidate && quickMatches.length === 0) {
      triggerHaptic(30);
      if (canEditPrices) {
        onRegisterBarcode(trimmed);
      } else {
        onOpenAccount();
      }
      return;
    }

    onNavigate('history');
  };

  const recentLogs = logs.slice(0, 4);

  return (
    <div className="w-full max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-6 pb-24 md:pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Left Column (7 cols on desktop): Terminal Header, Main Actions & Manual Search */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Operational Workspace Card */}
          <section className="bg-white rounded-2xl p-4 md:p-5 border border-[#e2e7ff]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#004ac6]">
                  {syncMode === 'cloud' && activeOperator
                    ? `${activeOperator.code} · ${activeOperator.role === 'admin' ? 'Perfil Gerente' : 'Perfil Operador'}`
                    : 'Terminal Ativo · Modo Local'}
                </p>
                <h1 className="text-xl md:text-2xl font-extrabold text-[#131b2e] tracking-tight mt-0.5 truncate">
                  {storeName || 'Operação de Caixa e Gôndola'}
                </h1>
              </div>

              {syncMode === 'cloud' ? (
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="text-xs font-bold text-[#006e2d] bg-[#dcfce7] hover:bg-[#bbf7d0] px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
                >
                  Nuvem + Cache Offline
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="text-xs font-bold text-[#004ac6] bg-[#eaedff] hover:bg-[#dae2fd] px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
                >
                  Conectar Nuvem
                </button>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-[#434655] bg-[#f2f3ff] px-3 py-2 rounded-lg">
              {syncMode === 'cloud' ? (
                <Cloud className="w-4 h-4 text-[#006e2d] shrink-0" />
              ) : (
                <Database className="w-4 h-4 text-[#006058] shrink-0" />
              )}
              <span className="truncate">
                {syncMode === 'cloud'
                  ? `Firestore Online · Cache Offline Ativo · ${activeOperator?.name || 'Operador'}`
                  : 'Banco Local IndexedDB · Entre com Google para sincronizar entre aparelhos'}
              </span>
            </div>
          </section>

          {/* Main Ergonomic High-Contrast Action Buttons */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            {/* Button 1: Consultar Preço */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(35);
                onStartScan('query');
              }}
              className="group relative flex flex-col justify-between text-left bg-[#2563eb] hover:bg-[#004ac6] active:scale-[0.99] active:brightness-95 transition-all duration-150 rounded-2xl p-5 text-white min-h-[144px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004ac6] focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <QrCode className="w-7 h-7 text-white" />
                </div>
                <span className="text-[11px] font-semibold text-white/90 whitespace-nowrap">
                  Modo Consulta · Rápido
                </span>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl md:text-2xl font-extrabold tracking-tight">
                    CONSULTAR PREÇO
                  </span>
                  <ArrowRight className="w-6 h-6 shrink-0 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs md:text-sm text-[#dbe1ff] mt-1">
                  Bipar código de barras para conferir valor na hora
                </p>
              </div>
            </button>

            {/* Button 2: Cadastrar / Atualizar */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(35);
                if (canEditPrices) {
                  onStartScan('register');
                } else {
                  onOpenAccount();
                }
              }}
              className={`group relative flex flex-col justify-between text-left transition-all duration-150 rounded-2xl p-5 text-white min-h-[132px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006058] focus-visible:ring-offset-2 ${
                canEditPrices
                  ? 'bg-[#007b71] hover:bg-[#006058] active:scale-[0.99] active:brightness-95'
                  : 'bg-[#434655] hover:bg-[#313444]'
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  {canEditPrices ? (
                    <Tag className="w-6 h-6 text-white" />
                  ) : (
                    <Lock className="w-6 h-6 text-white" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-white/90 whitespace-nowrap">
                  {canEditPrices ? 'Ajuste & Estoque' : 'Requer PIN Gerente'}
                </span>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg md:text-xl font-extrabold tracking-tight">
                    CADASTRAR / ATUALIZAR
                  </span>
                  <PlusCircle className="w-6 h-6 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs md:text-sm text-white/85 mt-1">
                  {canEditPrices
                    ? 'Bipar novo produto ou alterar preço de venda na gôndola'
                    : 'Toque para liberar alteração de preços com PIN de Gerente'}
                </p>
              </div>
            </button>
          </section>

          {/* Quick Manual Search Input */}
          <section className="relative bg-white rounded-2xl border border-[#cbd5e1] p-1.5 focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15 transition-all">
            <form onSubmit={handleManualSearchSubmit} className="flex items-center gap-2">
              <div className="pl-2.5 text-[#434655] pointer-events-none">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digitar código EAN ou nome manual..."
                aria-label="Pesquisar código EAN ou nome do produto"
                className="w-full py-2.5 text-sm md:text-base font-medium text-[#131b2e] placeholder:text-[#737686] bg-transparent focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Pesquisar produto"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white flex items-center justify-center shrink-0 active:scale-95 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>

            {/* Live Instant Match Dropdown */}
            {searchQuery.trim().length > 0 && (
              <div className="mt-1.5 pt-2 border-t border-[#e2e7ff] flex flex-col gap-1">
                {quickMatches.length > 0 ? (
                  quickMatches.map((item) => (
                    <button
                      key={item.barcode}
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        onOpenProduct(item);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-xl hover:bg-[#f2f3ff] text-left transition-colors min-h-[44px]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#131b2e] truncate">
                          {item.name}
                        </p>
                        <p className="font-mono text-xs text-[#434655]">
                          {item.barcode} · {item.location}
                        </p>
                      </div>
                      <span className="font-bold text-sm text-[#006e2d] tabular-nums whitespace-nowrap shrink-0">
                        {formatBRL(item.price)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-2.5 py-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#434655]">
                      Nenhum produto encontrado para "{searchQuery.trim()}".
                    </span>
                    {isNumericEanCandidate && (
                      <button
                        type="button"
                        onClick={() =>
                          canEditPrices
                            ? onRegisterBarcode(searchQuery.trim())
                            : onOpenAccount()
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#007b71] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:bg-[#006058] transition-colors"
                      >
                        Cadastrar EAN
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (5 cols on desktop): Counters & Recent Queries */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Quick Operational Counters */}
          <section className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-left bg-white hover:bg-[#f2f3ff]/60 rounded-2xl p-4 border border-[#e2e7ff] transition-colors flex flex-col justify-between min-h-[112px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#434655]">
                  {syncMode === 'cloud' ? 'Catálogo Nuvem' : 'Catálogo Local'}
                </span>
                <span className="text-xs font-semibold text-[#004ac6]">Ver</span>
              </div>
              <div className="mt-2">
                <p className="text-2xl md:text-3xl font-extrabold text-[#131b2e] tabular-nums tracking-tight">
                  {products.length.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-[#434655] mt-0.5">
                  {syncMode === 'cloud' ? 'Itens sincronizados' : 'Itens salvos offline'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-left bg-white hover:bg-[#f2f3ff]/60 rounded-2xl p-4 border border-[#e2e7ff] transition-colors flex flex-col justify-between min-h-[112px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#434655]">Bipados Hoje</span>
                <Barcode className="w-4 h-4 text-[#006e2d]" />
              </div>
              <div className="mt-2">
                <p className="text-2xl md:text-3xl font-extrabold text-[#006e2d] tabular-nums tracking-tight">
                  {todayScans}{' '}
                  <span className="text-sm font-bold text-[#006e2d]">un</span>
                </p>
                <p className="text-xs text-[#434655] mt-0.5">Registros do dia</p>
              </div>
            </button>
          </section>

          {/* Recent Queries List */}
          <section className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#2563eb]" />
                <h2 className="text-base font-bold text-[#131b2e]">Últimas Consultas</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="text-xs font-bold text-[#004ac6] hover:underline py-1 px-2 -mr-2 rounded-lg min-h-[36px]"
              >
                Ver todas
              </button>
            </div>

            {recentLogs.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#434655]">
                Nenhuma consulta registrada ainda. Clique em Consultar Preço para começar.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recentLogs.map((log) => {
                  const matchedProduct = products.find((p) => p.barcode === log.barcode);
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => {
                        if (matchedProduct) {
                          onOpenProduct(matchedProduct);
                        } else {
                          onRegisterBarcode(log.barcode);
                        }
                      }}
                      className="w-full flex items-center justify-between gap-3 p-2.5 bg-[#f2f3ff] hover:bg-[#eaedff] active:scale-[0.99] rounded-xl text-left transition-all min-h-[60px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ProductVisual
                          category={matchedProduct?.category || 'Mercearia'}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#131b2e] truncate">
                            {log.productName}
                          </p>
                          <p className="font-mono text-xs text-[#434655] truncate">
                            {log.barcode}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-sm font-extrabold text-[#006e2d] tabular-nums">
                          {formatBRL(log.price)}
                        </span>
                        <span className="text-[11px] text-[#434655] whitespace-nowrap">
                          {formatRelativeTime(log.timestamp)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
