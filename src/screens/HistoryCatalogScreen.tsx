import React, { useMemo, useState } from 'react';
import {
  Download,
  History,
  Package,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { CATEGORIES, Category, Product, ScanLog } from '../types/product';
import { formatBRL, formatRelativeTime } from '../utils/feedback';
import { ProductVisual } from '../components/ProductVisual';

interface HistoryCatalogScreenProps {
  products: Product[];
  logs: ScanLog[];
  onOpenProduct: (product: Product) => void;
  onNewProduct: () => void;
  onResetSeed: () => Promise<void>;
}

export function HistoryCatalogScreen({
  products,
  logs,
  onOpenProduct,
  onNewProduct,
  onResetSeed,
}: HistoryCatalogScreenProps) {
  const [tab, setTab] = useState<'catalog' | 'logs'>('catalog');
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'Todos' | Category>('Todos');
  const [confirmReset, setConfirmReset] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat =
        selectedCategory === 'Todos' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    });
  }, [products, query, selectedCategory]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        l.productName.toLowerCase().includes(q) ||
        l.barcode.toLowerCase().includes(q),
    );
  }, [logs, query]);

  const handleExportCsv = () => {
    const header = 'barcode,name,brand,category,price,stock,location,updatedAt\n';
    const rows = products
      .map(
        (p) =>
          `"${p.barcode}","${p.name.replace(/"/g, '""')}","${p.brand}","${p.category}",${p.price.toFixed(2)},${p.stock},"${p.location}","${p.updatedAt}"`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prontopreco-catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 md:px-6 py-4 md:py-6 pb-24 md:pb-10">
      <div className="flex flex-col gap-4">
        {/* Top Controls Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-[#eaedff] self-start">
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                tab === 'catalog'
                  ? 'bg-white text-[#131b2e] shadow-sm'
                  : 'text-[#434655] hover:text-[#131b2e]'
              }`}
            >
              <Package className="w-4 h-4 text-[#2563eb]" />
              <span>Catálogo Local ({products.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                tab === 'logs'
                  ? 'bg-white text-[#131b2e] shadow-sm'
                  : 'text-[#434655] hover:text-[#131b2e]'
              }`}
            >
              <History className="w-4 h-4 text-[#006e2d]" />
              <span>Histórico de Bips ({logs.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-10 px-3.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f2f3ff] text-xs font-bold text-[#131b2e] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-[#434655]" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={onNewProduct}
              className="h-10 px-4 rounded-xl bg-[#007b71] hover:bg-[#006058] text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Produto</span>
            </button>
          </div>
        </div>

        {/* Search & Category Filters */}
        <div className="bg-white rounded-2xl p-3 border border-[#e2e7ff] flex flex-col gap-3">
          <div className="flex items-center gap-2 px-3 h-11 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] focus-within:border-[#2563eb] focus-within:bg-white">
            <Search className="w-4 h-4 text-[#434655] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por nome, marca, EAN ou corredor..."
              className="w-full bg-transparent text-sm text-[#131b2e] placeholder:text-[#737686] outline-none"
            />
          </div>

          {tab === 'catalog' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(['Todos', ...CATEGORIES] as const).map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#2563eb] text-white'
                        : 'bg-[#eaedff] text-[#434655] hover:bg-[#dae2fd]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Main List */}
        {tab === 'catalog' ? (
          <div className="bg-white rounded-2xl border border-[#e2e7ff] overflow-hidden">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#434655]">
                Nenhum produto encontrado no catálogo local.
              </div>
            ) : (
              <div className="divide-y divide-[#f2f3ff]">
                {filteredProducts.map((item) => (
                  <button
                    key={item.barcode}
                    type="button"
                    onClick={() => onOpenProduct(item)}
                    className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-[#f2f3ff]/70 active:bg-[#eaedff] text-left transition-colors min-h-[68px]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ProductVisual category={item.category} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#131b2e] truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-[#434655] truncate mt-0.5">
                          <span className="font-mono font-semibold">{item.barcode}</span>
                          {' · '}
                          <span>{item.category}</span>
                          {' · '}
                          <span>{item.stock} un</span>
                          {' · '}
                          <span>{item.location}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <p className="text-base font-extrabold text-[#006e2d] tabular-nums">
                        {formatBRL(item.price)}
                      </p>
                      <p className="text-[11px] text-[#434655]">{item.weightLabel}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e2e7ff] overflow-hidden">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#434655]">
                Nenhum registro de bip encontrado.
              </div>
            ) : (
              <div className="divide-y divide-[#f2f3ff]">
                {filteredLogs.map((log) => {
                  const matched = products.find((p) => p.barcode === log.barcode);
                  const actionLabel =
                    log.action === 'cadastro'
                      ? 'Cadastro'
                      : log.action === 'ajuste'
                        ? 'Ajuste de Preço'
                        : 'Consulta';
                  return (
                    <button
                      key={log.id}
                      type="button"
                      disabled={!matched}
                      onClick={() => {
                        if (matched) onOpenProduct(matched);
                      }}
                      className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-[#f2f3ff]/70 disabled:opacity-70 text-left transition-colors min-h-[64px]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#131b2e] truncate">
                          {log.productName}
                        </p>
                        <p className="text-xs text-[#434655] mt-0.5">
                          <span className="font-mono">{log.barcode}</span>
                          {' · '}
                          <span className="font-semibold text-[#004ac6]">
                            {actionLabel}
                          </span>
                          {' · '}
                          <span>{formatRelativeTime(log.timestamp)}</span>
                        </p>
                      </div>
                      <span className="text-sm font-extrabold text-[#006e2d] tabular-nums shrink-0">
                        {formatBRL(log.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer Utility: Reset Seed Data */}
        <div className="flex justify-end pt-1">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="text-xs font-semibold text-[#434655] hover:text-[#131b2e] flex items-center gap-1.5 py-2 px-3 rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar catálogo inicial</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-xs font-semibold text-[#434655] px-3 py-1.5 rounded-lg bg-[#eaedff]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onResetSeed();
                  setConfirmReset(false);
                }}
                className="text-xs font-bold text-white px-3 py-1.5 rounded-lg bg-[#ba1a1a]"
              >
                Confirmar Restauração
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
