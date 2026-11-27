import React, { useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeCheck,
  Barcode,
  Check,
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
import {
  formatStockInputText,
  formatStockWithUnit,
  isDecimalStockUnit,
  normalizeStockUnit,
  parseStockInput,
  STOCK_UNIT_META,
} from '../utils/stockUnit';
import { ProductVisual } from '../components/ProductVisual';

interface ProductDetailsScreenProps {
  product: Product;
  syncMode: 'cloud' | 'local';
  canEditPrices: boolean;
  canAdjustStock: boolean;
  onScanNext: () => void;
  onEdit: (product: Product) => void;
  onAdjustStock: (
    barcode: string,
    value: number,
    mode: 'delta' | 'set',
  ) => Promise<void> | void;
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
  const unit = normalizeStockUnit(product.unit);
  const unitMeta = STOCK_UNIT_META[unit];
  const decimalUnit = isDecimalStockUnit(unit);

  const [adjustMode, setAdjustMode] = useState<'delta' | 'set'>('delta');
  const [qtyInput, setQtyInput] = useState<string>('');
  const [qtyError, setQtyError] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustFeedback, setAdjustFeedback] = useState<string | null>(null);

  useEffect(() => {
    setQtyError(null);
    setAdjustFeedback(null);
    if (adjustMode === 'set') {
      setQtyInput(formatStockInputText(product.stock, unit));
    } else {
      setQtyInput('');
    }
  }, [product.barcode, product.stock, unit, adjustMode]);

  const { integer, decimal } = formatPriceParts(product.price);
  const wholesale =
    product.wholesalePrice ?? Number((product.price * 0.94).toFixed(2));
  const club =
    product.clubPrice ?? Number((product.price * 0.9).toFixed(2));
  const margin = product.marginPercent ?? 28.0;

  const runAdjustment = async (
    value: number,
    mode: 'delta' | 'set',
    feedbackLabel: string,
  ) => {
    setAdjustBusy(true);
    setQtyError(null);
    try {
      await onAdjustStock(product.barcode, value, mode);
      triggerHaptic(25);
      setAdjustFeedback(feedbackLabel);
      if (mode === 'delta') {
        setQtyInput('');
      }
      window.setTimeout(() => {
        setAdjustFeedback((prev) => (prev === feedbackLabel ? null : prev));
      }, 2400);
    } catch {
      setQtyError('Não foi possível atualizar o estoque agora.');
    } finally {
      setAdjustBusy(false);
    }
  };

  const handleApplyTypedAdjustment = async (direction: 'add' | 'sub' | 'set') => {
    const parsed = parseStockInput(qtyInput, unit);
    if (!parsed.valid) {
      setQtyError(parsed.error || 'Quantidade inválida.');
      return;
    }
    if (direction === 'set') {
      await runAdjustment(
        parsed.value,
        'set',
        `Estoque definido para ${formatStockWithUnit(parsed.value, unit)}`,
      );
      return;
    }
    if (parsed.value <= 0) {
      setQtyError('Informe uma quantidade maior que zero para somar ou subtrair.');
      return;
    }
    const delta = direction === 'add' ? parsed.value : -parsed.value;
    const sign = direction === 'add' ? '+' : '-';
    await runAdjustment(
      delta,
      'delta',
      `Ajuste ${sign}${formatStockWithUnit(parsed.value, unit)} aplicado`,
    );
  };

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

            {/* Quick Location & Current Stock Summary */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#f2f3ff]">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="w-5 h-5 text-[#004ac6] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-[#434655] block">
                      Estoque Atual ({unitMeta.shortLabel})
                    </span>
                    <span className="text-base font-extrabold text-[#131b2e] tabular-nums">
                      {formatStockWithUnit(product.stock, unit)}
                    </span>
                  </div>
                </div>
                {canAdjustStock ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={adjustBusy}
                      aria-label="Diminuir 1 unidade"
                      onClick={() =>
                        void runAdjustment(-1, 'delta', `-1 ${unit} aplicado`)
                      }
                      className="w-8 h-8 rounded-lg bg-white border border-[#cbd5e1] flex items-center justify-center text-[#131b2e] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={adjustBusy}
                      aria-label="Aumentar 1 unidade"
                      onClick={() =>
                        void runAdjustment(1, 'delta', `+1 ${unit} aplicado`)
                      }
                      className="w-8 h-8 rounded-lg bg-white border border-[#cbd5e1] flex items-center justify-center text-[#131b2e] hover:bg-[#eaedff] active:scale-95 disabled:opacity-50 cursor-pointer"
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

            {/* Direct Numeric Stock Adjustment Controls */}
            {canAdjustStock && (
              <div className="rounded-xl border border-[#e2e7ff] bg-[#f8f9ff] p-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#131b2e]">
                    Movimentar / Definir Estoque ({unit})
                  </span>
                  <div className="inline-flex p-0.5 rounded-lg bg-[#e2e7ff]">
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustMode('delta');
                        setQtyError(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                        adjustMode === 'delta'
                          ? 'bg-white text-[#004ac6] shadow-xs'
                          : 'text-[#434655] hover:text-[#131b2e]'
                      }`}
                    >
                      Somar / Tirar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustMode('set');
                        setQtyError(null);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                        adjustMode === 'set'
                          ? 'bg-white text-[#004ac6] shadow-xs'
                          : 'text-[#434655] hover:text-[#131b2e]'
                      }`}
                    >
                      Definir Total
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl bg-white border border-[#cbd5e1] focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
                    <input
                      type="text"
                      inputMode={decimalUnit ? 'decimal' : 'numeric'}
                      value={qtyInput}
                      onChange={(e) => {
                        setQtyInput(e.target.value);
                        if (qtyError) setQtyError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleApplyTypedAdjustment(
                            adjustMode === 'set' ? 'set' : 'add',
                          );
                        }
                      }}
                      placeholder={
                        adjustMode === 'set'
                          ? decimalUnit
                            ? 'Total exato (ex: 1,500)'
                            : 'Total exato (ex: 24)'
                          : decimalUnit
                            ? 'Quantidade (ex: 2,500)'
                            : 'Quantidade (ex: 15)'
                      }
                      aria-label="Quantidade de estoque"
                      className="w-full bg-transparent text-sm font-extrabold text-[#131b2e] tabular-nums focus:outline-none"
                    />
                    <span className="text-xs font-extrabold text-[#004ac6] bg-[#eaedff] px-2 py-0.5 rounded shrink-0">
                      {unit}
                    </span>
                  </div>

                  {adjustMode === 'delta' ? (
                    <div className="grid grid-cols-2 gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={adjustBusy}
                        onClick={() => void handleApplyTypedAdjustment('add')}
                        className="h-11 px-3 rounded-xl bg-[#006e2d] hover:bg-[#005320] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                      >
                        <ArrowUpCircle className="w-4 h-4" />
                        <span>Entrada</span>
                      </button>
                      <button
                        type="button"
                        disabled={adjustBusy}
                        onClick={() => void handleApplyTypedAdjustment('sub')}
                        className="h-11 px-3 rounded-xl bg-[#434655] hover:bg-[#313444] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                      >
                        <ArrowDownCircle className="w-4 h-4" />
                        <span>Saída</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={adjustBusy}
                      onClick={() => void handleApplyTypedAdjustment('set')}
                      className="h-11 px-4 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0 active:scale-95 transition-all"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aplicar Total</span>
                    </button>
                  )}
                </div>

                {qtyError && (
                  <p className="text-xs font-semibold text-[#ba1a1a]">{qtyError}</p>
                )}
                {!qtyError && adjustFeedback && (
                  <p className="text-xs font-bold text-[#006e2d] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{adjustFeedback}</span>
                  </p>
                )}
              </div>
            )}
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
                  Atacado (3+ {unit.toLowerCase()})
                </span>
                <span className="text-sm font-extrabold text-[#131b2e] tabular-nums">
                  {formatBRL(wholesale)}{' '}
                  <span className="text-[11px] font-normal text-[#434655]">
                    /{unit.toLowerCase()}
                  </span>
                </span>
              </div>
              <div className="px-2">
                <span className="text-[10px] font-bold uppercase text-[#434655] block">
                  Clube Fidelidade
                </span>
                <span className="text-sm font-extrabold text-[#004ac6] tabular-nums">
                  {formatBRL(club)}{' '}
                  <span className="text-[11px] font-normal text-[#434655]">
                    /{unit.toLowerCase()}
                  </span>
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
