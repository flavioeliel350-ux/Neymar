import React from 'react';
import {
  BadgeCheck,
  Barcode,
  CheckCircle2,
  Edit3,
  History,
  Layers,
  Lock,
  Minus,
  Package,
  Plus,
  ScanBarcode,
  Tag,
} from 'lucide-react';
import { Product } from '../types/product';
import {
  formatAuditTimestamp,
  formatBRL,
  formatPriceParts,
  triggerHaptic,
} from '../utils/feedback';
import { ProductVisual } from '../components/ProductVisual';

interface ProductDetailsScreenProps {
  product: Product;
  syncMode: 'cloud' | 'local';
  canEditPrices: boolean;
  canAdjustStock: boolean;
  onScanNext: () => void;
  onEdit: (product: Product) => void;
  onAdjustStock: (barcode: string, delta: number) => void;
  onRequireManager: () => void;
}

export function ProductDetailsScreen({
  product,
  syncMode,
  canEditPrices,
  canAdjustStock,
  onScanNext,
  onEdit,
  onAdjustStock,
  onRequireManager,
}: ProductDetailsScreenProps) {
  const { integer, decimal } = formatPriceParts(product.price);
  const wholesale =
    product.wholesalePrice ?? Number((product.price * 0.94).toFixed(2));
  const club =
    product.clubPrice ?? Number((product.price * 0.9).toFixed(2));
  const margin = product.marginPercent ?? 28.0;

  return (
    <div className="w-full max-w-4xl mx-auto px-3 md:px-6 py-4 md:py-6 pb-10">
      <div className="flex flex-col gap-3.5">
        {/* Status & Match Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#006e2d]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {syncMode === 'cloud'
                ? 'Produto Sincronizado na Nuvem'
                : 'Produto na Conta Local'}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#434655] bg-[#eaedff] px-2.5 py-1 rounded-lg">
            <Barcode className="w-3.5 h-3.5" />
            <span>{product.barcode}</span>
          </div>
        </div>

        {/* Desktop 2-column split: Hero Product Info + Giant Price Card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
          {/* Hero Product Card */}
          <div className="md:col-span-7 bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <ProductVisual
                category={product.category}
                weightLabel={product.weightLabel}
                imageUrl={product.imageUrl}
                alt={product.name}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#434655] mb-1">
                  <span className="text-[#004ac6] font-bold">{product.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{product.brand || 'Marca Padrão'}</span>
                </div>
                <h2 className="text-xl md:text-2xl font-extrabold text-[#131b2e] leading-tight tracking-tight">
                  {product.name}
                </h2>
                {product.description ? (
                  <p className="text-xs text-[#434655] mt-1.5">{product.description}</p>
                ) : null}
              </div>
            </div>

            {/* Quick Location & Interactive Inventory */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#f2f3ff]">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="w-5 h-5 text-[#004ac6] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-[#434655] block">
                      Estoque em Loja
                    </span>
                    <span className="text-sm font-extrabold text-[#131b2e] tabular-nums">
                      {product.stock} un
                    </span>
                  </div>
                </div>
                {canAdjustStock ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label="Diminuir estoque"
                      onClick={() => {
                        triggerHaptic(20);
                        onAdjustStock(product.barcode, -1);
                      }}
                      className="w-7 h-7 rounded-lg bg-white border border-[#cbd5e1] flex items-center justify-center text-[#131b2e] hover:bg-[#eaedff] active:scale-95 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Aumentar estoque"
                      onClick={() => {
                        triggerHaptic(20);
                        onAdjustStock(product.barcode, 1);
                      }}
                      className="w-7 h-7 rounded-lg bg-white border border-[#cbd5e1] flex items-center justify-center text-[#131b2e] hover:bg-[#eaedff] active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span
                    title="Operador sem permissão de ajuste de estoque"
                    className="w-7 h-7 rounded-lg bg-white/70 border border-[#cbd5e1] flex items-center justify-center text-[#737686] shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#f2f3ff]">
                <Layers className="w-5 h-5 text-[#006058] shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-[#434655] block">
                    Localização
                  </span>
                  <span className="text-sm font-extrabold text-[#131b2e] truncate block">
                    {product.location || 'Não definida'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Giant Retail Price Card */}
          <div className="md:col-span-5 rounded-2xl bg-[#dcfce7] border border-[#86efac] p-4 md:p-5 flex flex-col justify-between text-center">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#006e2d] text-white text-[11px] font-bold uppercase tracking-wider">
                <Tag className="w-3.5 h-3.5" />
                <span>Preço Varejo</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#005320]">
                <BadgeCheck className="w-4 h-4" />
                <span>Validado</span>
              </span>
            </div>

            <div className="py-4 flex items-baseline justify-center tabular-nums select-all">
              <span className="text-2xl font-extrabold text-[#007230] mr-1.5">R$</span>
              <span className="text-5xl md:text-6xl font-black text-[#006e2d] tracking-tighter leading-none">
                {integer}
              </span>
              <span className="text-3xl md:text-4xl font-black text-[#006e2d] tracking-tighter leading-none">
                {decimal}
              </span>
            </div>

            <div className="bg-white/90 rounded-xl p-2.5 grid grid-cols-2 divide-x divide-[#e2e7ff]">
              <div className="px-2">
                <span className="text-[10px] font-bold uppercase text-[#434655] block">
                  Atacado (3+ un)
                </span>
                <span className="text-sm font-extrabold text-[#131b2e] tabular-nums">
                  {formatBRL(wholesale)}{' '}
                  <span className="text-[11px] font-normal text-[#434655]">/un</span>
                </span>
              </div>
              <div className="px-2">
                <span className="text-[10px] font-bold uppercase text-[#434655] block">
                  Clube Fidelidade
                </span>
                <span className="text-sm font-extrabold text-[#004ac6] tabular-nums">
                  {formatBRL(club)}{' '}
                  <span className="text-[11px] font-normal text-[#434655]">/un</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Audit Trail Block */}
        <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#434655]">
              <History className="w-4 h-4 text-[#737686]" />
              <span>
                Última alteração:{' '}
                <strong className="text-[#131b2e]">
                  {formatAuditTimestamp(product.updatedAt)}
                </strong>
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#eaedff] font-mono text-[11px] font-semibold text-[#434655]">
              {product.operator}
            </span>
          </div>

          <div className="pt-2 border-t border-[#f2f3ff] flex items-center justify-between text-xs">
            <span className="text-[#434655]">Margem Bruta Cadastrada</span>
            <span className="text-sm font-extrabold text-[#006e2d] tabular-nums">
              {margin.toFixed(1).replace('.', ',')}%
            </span>
          </div>
        </div>

        {/* Quick Ergonomic Bottom Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(35);
              onScanNext();
            }}
            className="w-full h-14 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.99] transition-all"
          >
            <ScanBarcode className="w-5 h-5" />
            <span>BIPAR PRÓXIMO PRODUTO</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(25);
              if (canEditPrices) {
                onEdit(product);
              } else {
                onRequireManager();
              }
            }}
            className="w-full h-14 rounded-xl bg-[#e2e7ff] hover:bg-[#dae2fd] text-[#131b2e] font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
          >
            {canEditPrices ? (
              <Edit3 className="w-4 h-4 text-[#434655]" />
            ) : (
              <Lock className="w-4 h-4 text-[#004ac6]" />
            )}
            <span>
              {canEditPrices
                ? 'Alterar Preço / Editar Cadastro'
                : 'Alterar Preço (Requer Gerente)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
