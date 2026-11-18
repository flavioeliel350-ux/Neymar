import React, { useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Lock,
  ScanBarcode,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { CATEGORIES, Category, Product } from '../types/product';
import { playBeep, triggerHaptic } from '../utils/feedback';

interface ProductFormScreenProps {
  initialBarcode?: string;
  existingProduct?: Product | null;
  lockBarcode?: boolean;
  onSave: (product: Omit<Product, 'updatedAt'>) => Promise<Product>;
  onDelete?: (barcode: string) => Promise<void>;
  onContinueScanning: () => void;
  onViewProduct: (product: Product) => void;
  onCancel: () => void;
}

function parsePriceInput(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

function formatPriceInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function ProductFormScreen({
  initialBarcode = '',
  existingProduct = null,
  lockBarcode = false,
  onSave,
  onDelete,
  onContinueScanning,
  onViewProduct,
  onCancel,
}: ProductFormScreenProps) {
  const isEditing = Boolean(existingProduct);

  const [barcode, setBarcode] = useState(
    existingProduct?.barcode || initialBarcode || '',
  );
  const [name, setName] = useState(existingProduct?.name || '');
  const [brand, setBrand] = useState(existingProduct?.brand || '');
  const [priceStr, setPriceStr] = useState(
    existingProduct ? formatPriceInput(existingProduct.price) : '',
  );
  const [category, setCategory] = useState<Category>(
    existingProduct?.category || 'Mercearia',
  );
  const [location, setLocation] = useState(
    existingProduct?.location || 'Gôndola 01 - Prateleira A',
  );
  const [weightLabel, setWeightLabel] = useState(
    existingProduct?.weightLabel || 'un',
  );
  const [stockStr, setStockStr] = useState(
    existingProduct ? String(existingProduct.stock) : '12',
  );
  const [marginStr, setMarginStr] = useState(
    existingProduct?.marginPercent ? String(existingProduct.marginPercent) : '30',
  );
  const [description, setDescription] = useState(
    existingProduct?.description || '',
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const adjustPrice = (delta: number) => {
    const current = parsePriceInput(priceStr);
    const next = Math.max(0, current + delta);
    setPriceStr(formatPriceInput(next));
    triggerHaptic(20);
  };

  const roundToNinetyNine = () => {
    const current = parsePriceInput(priceStr);
    const floored = Math.floor(current);
    setPriceStr(formatPriceInput(floored + 0.99));
    triggerHaptic(20);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) {
      setErrorMsg('Informe o código de barras do produto.');
      return;
    }

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Informe o nome do produto.');
      return;
    }

    const numericPrice = parsePriceInput(priceStr);
    if (numericPrice <= 0) {
      setErrorMsg('Informe um preço de venda maior que zero.');
      return;
    }

    const stockNum = Math.max(0, parseInt(stockStr, 10) || 0);
    const marginNum = Math.max(0, parseFloat(marginStr.replace(',', '.')) || 28);

    try {
      setSaving(true);
      const saved = await onSave({
        barcode: cleanBarcode,
        name: cleanName,
        brand: brand.trim() || 'Marca Própria',
        category,
        price: Number(numericPrice.toFixed(2)),
        wholesalePrice: Number((numericPrice * 0.94).toFixed(2)),
        clubPrice: Number((numericPrice * 0.9).toFixed(2)),
        marginPercent: Number(marginNum.toFixed(1)),
        stock: stockNum,
        location: location.trim() || 'Balcão',
        weightLabel: weightLabel.trim() || 'un',
        description: description.trim(),
        operator: 'Op. 01',
      });
      playBeep('save');
      triggerHaptic(40);
      setSavedProduct(saved);
    } catch {
      setErrorMsg('Erro ao gravar produto no banco local.');
    } finally {
      setSaving(false);
    }
  };

  if (savedProduct) {
    return (
      <div className="w-full max-w-xl mx-auto px-3 md:px-6 py-8">
        <div className="bg-white rounded-2xl border border-[#86efac] p-6 text-center flex flex-col items-center gap-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#dcfce7] text-[#006e2d] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-[#131b2e]">
              Produto Gravado Offline!
            </h2>
            <p className="text-sm text-[#434655] mt-1">
              {savedProduct.name} ·{' '}
              <span className="font-mono">{savedProduct.barcode}</span>
            </p>
            <p className="text-2xl font-black text-[#006e2d] tabular-nums mt-2">
              R$ {formatPriceInput(savedProduct.price)}
            </p>
          </div>

          <div className="w-full flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={onContinueScanning}
              className="flex-1 h-12 rounded-xl bg-[#007b71] hover:bg-[#006058] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Continuar Bipando</span>
            </button>
            <button
              type="button"
              onClick={() => onViewProduct(savedProduct)}
              className="flex-1 h-12 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] text-[#131b2e] font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <span>Ver Detalhes</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-3 md:px-6 py-4 md:py-6 pb-12">
      <div className="flex flex-col gap-4">
        {/* Status Notification Banner */}
        <div className="flex items-start gap-3 p-3.5 bg-[#dcfce7]/60 border border-[#86efac] rounded-xl">
          <div className="w-9 h-9 rounded-full bg-[#006e2d] text-white flex items-center justify-center shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[#005320]">
              {isEditing
                ? 'Produto encontrado no banco local'
                : 'Código pronto para cadastro offline'}
            </p>
            <p className="text-xs text-[#434655] mt-0.5">
              {isEditing
                ? 'Atualize o preço de venda, seção ou estoque para aplicar na hora.'
                : 'Preencha os dados essenciais e salve no armazenamento local.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#ffdad6] text-[#93000a] text-xs font-bold"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Field 1: Barcode EAN */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="barcodeInput"
                className="text-xs font-bold uppercase tracking-wider text-[#434655]"
              >
                Código de Barras (EAN-13)
              </label>
              {lockBarcode && (
                <span className="text-[11px] font-bold text-[#006058] flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Travado</span>
                </span>
              )}
            </div>
            <div
              className={`flex items-center h-12 px-3.5 rounded-xl border ${
                lockBarcode
                  ? 'bg-[#e2e7ff] border-[#c3c6d7] text-[#131b2e]'
                  : 'bg-white border-[#cbd5e1] focus-within:border-[#2563eb]'
              }`}
            >
              {lockBarcode && <Lock className="w-4 h-4 text-[#737686] mr-2.5 shrink-0" />}
              <input
                id="barcodeInput"
                type="text"
                inputMode="numeric"
                value={barcode}
                readOnly={lockBarcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ex: 7891000100103"
                className="w-full bg-transparent font-mono text-sm font-bold tracking-wider outline-none"
              />
              {barcode.trim().length >= 8 && (
                <CheckCircle2 className="w-5 h-5 text-[#006e2d] shrink-0" />
              )}
            </div>
          </div>

          {/* Field 2: Product Name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="productName"
              className="text-xs font-bold text-[#131b2e]"
            >
              Nome do Produto <span className="text-[#ba1a1a]">*</span>
            </label>
            <div className="relative flex items-center bg-white rounded-xl border border-[#cbd5e1] focus-within:border-[#2563eb] focus-within:ring-2 focus-within:ring-[#2563eb]/15">
              <input
                id="productName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Café Torrado e Moído Pilão 500g"
                className="w-full h-12 pl-3.5 pr-11 bg-transparent text-sm md:text-base font-semibold text-[#131b2e] outline-none"
              />
              {name && (
                <button
                  type="button"
                  aria-label="Limpar nome"
                  onClick={() => setName('')}
                  className="absolute right-2 w-8 h-8 rounded-full flex items-center justify-center text-[#737686] hover:text-[#131b2e] hover:bg-[#eaedff]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Field 3: Selling Price Highlight */}
          <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="priceInput"
                className="text-xs font-bold uppercase tracking-wider text-[#131b2e]"
              >
                Preço de Venda <span className="text-[#ba1a1a]">*</span>
              </label>
              <span className="text-xs font-bold text-[#006e2d] bg-[#dcfce7] px-2.5 py-0.5 rounded-md">
                Varejo Unitário
              </span>
            </div>

            <div className="flex items-baseline bg-[#f2f3ff] px-4 py-2.5 rounded-xl border border-[#cbd5e1] focus-within:border-[#2563eb]">
              <span className="text-xl font-extrabold text-[#006e2d] mr-2 select-none">
                R$
              </span>
              <input
                id="priceInput"
                type="text"
                inputMode="decimal"
                required
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="0,00"
                className="w-full bg-transparent text-3xl md:text-4xl font-black text-[#006e2d] tabular-nums outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => adjustPrice(0.5)}
                className="h-10 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] active:scale-95 text-[#131b2e] text-xs font-bold transition-all"
              >
                +R$ 0,50
              </button>
              <button
                type="button"
                onClick={() => adjustPrice(1.0)}
                className="h-10 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] active:scale-95 text-[#131b2e] text-xs font-bold transition-all"
              >
                +R$ 1,00
              </button>
              <button
                type="button"
                onClick={roundToNinetyNine}
                className="h-10 rounded-lg bg-[#dbe1ff] hover:bg-[#b4c5ff] active:scale-95 text-[#00174b] text-xs font-bold transition-all"
              >
                Arredondar ,99
              </button>
            </div>
          </div>

          {/* Field 4: Category Selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#434655]">
              Seção / Categoria
            </span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all min-h-[38px] ${
                      active
                        ? 'bg-[#004ac6] text-white shadow-sm'
                        : 'bg-[#eaedff] text-[#434655] hover:bg-[#dae2fd]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 5: Location, Brand, Weight & Stock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="locationInput"
                className="text-xs font-bold uppercase tracking-wider text-[#434655]"
              >
                Localização no Salão
              </label>
              <div className="flex items-center bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] focus-within:border-[#2563eb]">
                <Store className="w-4 h-4 text-[#737686] mr-2 shrink-0" />
                <input
                  id="locationInput"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Prateleira A-04"
                  className="w-full bg-transparent text-sm font-medium text-[#131b2e] outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="brandInput"
                className="text-xs font-bold uppercase tracking-wider text-[#434655]"
              >
                Marca / Fabricante
              </label>
              <input
                id="brandInput"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Pilão"
                className="bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] focus:border-[#2563eb] text-sm font-medium text-[#131b2e] outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="weightInput"
                  className="text-[11px] font-bold uppercase text-[#434655]"
                >
                  Peso / Emb.
                </label>
                <input
                  id="weightInput"
                  type="text"
                  value={weightLabel}
                  onChange={(e) => setWeightLabel(e.target.value)}
                  placeholder="500g"
                  className="bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] text-sm font-semibold text-[#131b2e] outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="stockInput"
                  className="text-[11px] font-bold uppercase text-[#434655]"
                >
                  Estoque (un)
                </label>
                <input
                  id="stockInput"
                  type="number"
                  min={0}
                  value={stockStr}
                  onChange={(e) => setStockStr(e.target.value)}
                  className="bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] text-sm font-semibold text-[#131b2e] tabular-nums outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="marginInput"
                  className="text-[11px] font-bold uppercase text-[#434655]"
                >
                  Margem (%)
                </label>
                <input
                  id="marginInput"
                  type="text"
                  inputMode="decimal"
                  value={marginStr}
                  onChange={(e) => setMarginStr(e.target.value)}
                  className="bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] text-sm font-semibold text-[#131b2e] tabular-nums outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="descInput"
              className="text-xs font-bold uppercase tracking-wider text-[#434655]"
            >
              Observação (Opcional)
            </label>
            <input
              id="descInput"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Oferta de fim de semana, lote B..."
              className="bg-white h-11 px-3 rounded-xl border border-[#cbd5e1] text-sm text-[#131b2e] outline-none focus:border-[#2563eb]"
            />
          </div>

          {/* Save & Cancel Actions */}
          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="submit"
              disabled={saving}
              className="w-full h-14 bg-[#006e2d] hover:bg-[#005320] disabled:opacity-60 text-white rounded-xl font-extrabold text-sm md:text-base uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all"
            >
              <CloudUpload className="w-5 h-5" />
              <span>
                {saving ? 'Gravando...' : 'Salvar Produto no Banco Local'}
              </span>
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl text-xs font-bold text-[#434655] hover:bg-[#eaedff] flex items-center justify-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Cancelar e voltar</span>
              </button>

              {isEditing && onDelete && existingProduct && (
                <div className="shrink-0">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="h-11 px-4 rounded-xl text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDelete(existingProduct.barcode)}
                      className="h-11 px-4 rounded-xl text-xs font-bold bg-[#ba1a1a] text-white flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmar Exclusão</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
