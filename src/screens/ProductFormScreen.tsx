import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  CloudUpload,
  ImagePlus,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  ScanBarcode,
  Search,
  Sparkles,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { CATEGORIES, Category, Product } from '../types/product';
import { playBeep, triggerHaptic } from '../utils/feedback';
import { lookupProductByBarcode } from '../services/barcodeLookupService';
import { ProductVisual } from '../components/ProductVisual';
import {
  compressImageFileToDataUrl,
  sanitizeProductImageUrl,
  validateHttpsImageUrl,
} from '../utils/imageHelper';

interface ProductFormScreenProps {
  initialBarcode?: string;
  existingProduct?: Product | null;
  lockBarcode?: boolean;
  syncMode: 'cloud' | 'local';
  canEditPrices: boolean;
  operatorCode: string;
  onSave: (product: Omit<Product, 'updatedAt'>) => Promise<Product>;
  onDelete?: (barcode: string) => Promise<void>;
  onContinueScanning: () => void;
  onViewProduct: (product: Product) => void;
  onCancel: () => void;
  onOpenAccount: () => void;
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
  syncMode,
  canEditPrices,
  operatorCode,
  onSave,
  onDelete,
  onContinueScanning,
  onViewProduct,
  onCancel,
  onOpenAccount,
}: ProductFormScreenProps) {
  const isEditing = Boolean(existingProduct);

  const [barcode, setBarcode] = useState(
    existingProduct?.barcode || initialBarcode || '',
  );
  const [name, setName] = useState(existingProduct?.name || '');
  const [brand, setBrand] = useState(existingProduct?.brand || '');
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    existingProduct?.imageUrl,
  );
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

  const [lookupStatus, setLookupStatus] = useState<
    'idle' | 'loading' | 'found' | 'not_found'
  >('idle');
  const [lookupSource, setLookupSource] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const nameDirtyRef = useRef(Boolean(existingProduct?.name));
  const brandDirtyRef = useRef(Boolean(existingProduct?.brand));
  const weightDirtyRef = useRef(Boolean(existingProduct?.weightLabel));
  const categoryDirtyRef = useRef(Boolean(existingProduct?.category));
  const imageDirtyRef = useRef(Boolean(existingProduct?.imageUrl));
  const lastLookedUpRef = useRef<string>('');

  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState(
    existingProduct?.imageUrl?.startsWith('https://') ? existingProduct.imageUrl : '',
  );
  const [imageProcessing, setImageProcessing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-focus name (or price if editing) for fast zero-friction registration
  useEffect(() => {
    if (!canEditPrices) return;
    const timer = setTimeout(() => {
      if (isEditing) {
        priceInputRef.current?.focus();
      } else if (initialBarcode) {
        nameInputRef.current?.focus();
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [canEditPrices, isEditing, initialBarcode]);

  const runBarcodeLookup = useCallback(async (rawCode: string, force = false) => {
    const clean = rawCode.trim().replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(clean)) return;
    if (!force && lastLookedUpRef.current === clean) return;

    lastLookedUpRef.current = clean;
    setLookupStatus('loading');
    setLookupSource(null);

    const found = await lookupProductByBarcode(clean);
    if (lastLookedUpRef.current !== clean) return;

    if (!found) {
      setLookupStatus('not_found');
      if (!nameDirtyRef.current) {
        nameInputRef.current?.focus();
      }
      return;
    }

    if (!nameDirtyRef.current && found.name) {
      setName(found.name);
      // Como o nome veio pronto, move foco para o preço para digitação imediata
      priceInputRef.current?.focus();
    }
    if (!brandDirtyRef.current && found.brand) {
      setBrand(found.brand);
    }
    if (!weightDirtyRef.current && found.weightLabel) {
      setWeightLabel(found.weightLabel);
    }
    if (!categoryDirtyRef.current && found.category) {
      setCategory(found.category);
    }
    if (!imageDirtyRef.current && found.imageUrl) {
      const sanitizedFoundImg = sanitizeProductImageUrl(found.imageUrl);
      if (sanitizedFoundImg) {
        setImageUrl(sanitizedFoundImg);
        if (sanitizedFoundImg.startsWith('https://')) {
          setImageUrlDraft(sanitizedFoundImg);
        }
      }
    }

    setLookupSource(found.source);
    setLookupStatus('found');
  }, []);

  useEffect(() => {
    if (isEditing || !canEditPrices) return;
    const clean = barcode.trim().replace(/\s+/g, '');
    if (!/^\d{8,14}$/.test(clean)) {
      setLookupStatus('idle');
      return;
    }

    const delay = clean === initialBarcode.trim() ? 40 : 480;
    const timer = setTimeout(() => {
      void runBarcodeLookup(clean);
    }, delay);

    return () => clearTimeout(timer);
  }, [barcode, initialBarcode, isEditing, canEditPrices, runBarcodeLookup]);

  if (!canEditPrices) {
    return (
      <div className="w-full max-w-xl mx-auto px-3 md:px-6 py-8">
        <div className="bg-white rounded-2xl border border-[#e2e7ff] p-6 text-center flex flex-col items-center gap-4 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[#eaedff] text-[#004ac6] flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[#131b2e]">
              Acesso Restrito ao Perfil Gerente
            </h2>
            <p className="text-sm text-[#434655] mt-1">
              O operador atual ({operatorCode}) tem permissão para consultar preços e ajustar estoque no balcão. Para alterar preços ou cadastrar produtos, troque para um Gerente com PIN.
            </p>
          </div>
          <div className="w-full flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex-1 h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>Trocar para Gerente (PIN)</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-12 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] text-[#131b2e] font-bold text-sm flex items-center justify-center cursor-pointer"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImageError(null);
    setImageProcessing(true);
    try {
      const compressedDataUrl = await compressImageFileToDataUrl(file);
      imageDirtyRef.current = true;
      setImageUrl(compressedDataUrl);
      setImageUrlDraft('');
      setShowImageUrlInput(false);
      triggerHaptic(20);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Erro ao processar imagem selecionada.',
      );
    } finally {
      setImageProcessing(false);
    }
  };

  const handleApplyImageUrl = () => {
    const valid = validateHttpsImageUrl(imageUrlDraft);
    if (!valid) {
      setImageError('Informe um link válido começando com https://');
      return;
    }
    imageDirtyRef.current = true;
    setImageUrl(valid);
    setImageError(null);
    setShowImageUrlInput(false);
    triggerHaptic(20);
  };

  const handleRemoveImage = () => {
    imageDirtyRef.current = true;
    setImageUrl(undefined);
    setImageUrlDraft('');
    setImageError(null);
    setShowImageUrlInput(false);
    triggerHaptic(15);
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
      nameInputRef.current?.focus();
      return;
    }

    const numericPrice = parsePriceInput(priceStr);
    if (numericPrice <= 0) {
      setErrorMsg('Informe um preço de venda maior que zero.');
      priceInputRef.current?.focus();
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
        imageUrl: sanitizeProductImageUrl(imageUrl) || undefined,
        operator: operatorCode || 'Op. 01',
      });
      playBeep('save');
      triggerHaptic(40);
      setSavedProduct(saved);
    } catch {
      setErrorMsg(
        syncMode === 'cloud'
          ? 'Erro ao salvar produto na nuvem.'
          : 'Erro ao gravar produto na conta local.',
      );
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
              {syncMode === 'cloud'
                ? 'Produto Gravado e Sincronizado!'
                : 'Produto Gravado na Conta Local!'}
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
              className="flex-1 h-12 rounded-xl bg-[#007b71] hover:bg-[#006058] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>Continuar Bipando</span>
            </button>
            <button
              type="button"
              onClick={() => onViewProduct(savedProduct)}
              className="flex-1 h-12 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] text-[#131b2e] font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
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
        {/* Status Notification Banner with Product Preview */}
        <div className="flex items-center gap-3 p-3.5 bg-[#dcfce7]/60 border border-[#86efac] rounded-xl">
          {imageUrl ? (
            <ProductVisual
              category={category}
              imageUrl={imageUrl}
              alt={name || 'Produto'}
              size="md"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#006e2d] text-white flex items-center justify-center shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[#005320]">
              {isEditing
                ? syncMode === 'cloud'
                  ? 'Produto encontrado na loja conectada'
                  : 'Produto encontrado na conta local'
                : syncMode === 'cloud'
                  ? 'Código pronto para cadastro sincronizado'
                  : 'Código pronto para cadastro local'}
            </p>
            <p className="text-xs text-[#434655] mt-0.5">
              {isEditing
                ? 'Atualize o preço de venda, seção ou estoque para aplicar na hora.'
                : 'Consultamos nome, marca e foto automaticamente — você pode editar ou preencher tudo manualmente.'}
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
          {/* Field 1: Barcode EAN + Smart Public Lookup */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="barcodeInput"
                className="text-xs font-bold uppercase tracking-wider text-[#434655]"
              >
                Código de Barras (EAN / GTIN)
              </label>
              {lockBarcode && (
                <span className="text-[11px] font-bold text-[#006058] flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Travado</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`flex-1 flex items-center h-12 px-3.5 rounded-xl border ${
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

              {!isEditing && barcode.trim().length >= 8 && (
                <button
                  type="button"
                  onClick={() => void runBarcodeLookup(barcode, true)}
                  disabled={lookupStatus === 'loading'}
                  className="h-12 px-3.5 rounded-xl bg-[#eaedff] hover:bg-[#dae2fd] text-[#004ac6] text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {lookupStatus === 'loading' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Buscar EAN</span>
                </button>
              )}
            </div>

            {!isEditing && lookupStatus !== 'idle' && (
              <div className="flex items-center gap-1.5 text-xs px-1">
                {lookupStatus === 'loading' && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#004ac6]" />
                    <span className="text-[#434655] font-medium">
                      Buscando nome, marca e foto nas bases públicas...
                    </span>
                  </>
                )}
                {lookupStatus === 'found' && (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-[#006e2d]" />
                    <span className="text-[#006e2d] font-bold">
                      Dados preenchidos automaticamente via {lookupSource}
                    </span>
                  </>
                )}
                {lookupStatus === 'not_found' && (
                  <span className="text-[#434655]">
                    Produto não localizado na base pública (ou offline). Preencha manualmente abaixo sem perder o código.
                  </span>
                )}
              </div>
            )}
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
                ref={nameInputRef}
                id="productName"
                type="text"
                required
                value={name}
                onChange={(e) => {
                  nameDirtyRef.current = e.target.value.trim().length > 0;
                  setName(e.target.value);
                }}
                placeholder="Ex: Café Torrado e Moído 500g"
                className="w-full h-12 pl-3.5 pr-11 bg-transparent text-sm md:text-base font-semibold text-[#131b2e] outline-none"
              />
              {name && (
                <button
                  type="button"
                  aria-label="Limpar nome"
                  onClick={() => {
                    nameDirtyRef.current = false;
                    setName('');
                    nameInputRef.current?.focus();
                  }}
                  className="absolute right-2 w-8 h-8 rounded-full flex items-center justify-center text-[#737686] hover:text-[#131b2e] hover:bg-[#eaedff] cursor-pointer"
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
                ref={priceInputRef}
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
                className="h-10 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] active:scale-95 text-[#131b2e] text-xs font-bold transition-all cursor-pointer"
              >
                +R$ 0,50
              </button>
              <button
                type="button"
                onClick={() => adjustPrice(1.0)}
                className="h-10 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] active:scale-95 text-[#131b2e] text-xs font-bold transition-all cursor-pointer"
              >
                +R$ 1,00
              </button>
              <button
                type="button"
                onClick={roundToNinetyNine}
                className="h-10 rounded-lg bg-[#dbe1ff] hover:bg-[#b4c5ff] active:scale-95 text-[#00174b] text-xs font-bold transition-all cursor-pointer"
              >
                Arredondar ,99
              </button>
            </div>
          </div>

          {/* Field 3.5: Product Image Editor */}
          <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#131b2e]">
                Imagem do Produto (Opcional)
              </span>
              {imageUrl && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6] px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              <ProductVisual
                category={category}
                imageUrl={imageUrl}
                alt={name || 'Produto'}
                size="lg"
              />

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <p className="text-xs text-[#434655]">
                  {imageUrl
                    ? 'Imagem configurada. Você pode trocar por foto da galeria, câmera ou link HTTPS.'
                    : 'Sem imagem definida (usando ícone da categoria). Envie uma foto ou cole um link.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={imageProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-9 px-3 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] disabled:opacity-60 text-[#004ac6] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {imageProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5" />
                    )}
                    <span>{imageProcessing ? 'Processando...' : 'Galeria / Arquivo'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={imageProcessing}
                    onClick={() => cameraInputRef.current?.click()}
                    className="h-9 px-3 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] disabled:opacity-60 text-[#004ac6] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Tirar Foto</span>
                  </button>

                  <button
                    type="button"
                    disabled={imageProcessing}
                    onClick={() => {
                      setImageError(null);
                      setShowImageUrlInput((prev) => !prev);
                    }}
                    className="h-9 px-3 rounded-lg bg-[#f2f3ff] hover:bg-[#eaedff] text-[#434655] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Link HTTPS</span>
                  </button>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageFileChange}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageFileChange}
              className="hidden"
            />

            {showImageUrlInput && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <input
                  type="url"
                  value={imageUrlDraft}
                  onChange={(e) => {
                    setImageError(null);
                    setImageUrlDraft(e.target.value);
                  }}
                  placeholder="https://exemplo.com/imagem-produto.jpg"
                  className="flex-1 h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] focus:border-[#2563eb] text-xs font-medium text-[#131b2e] outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyImageUrl}
                  className="h-10 px-4 rounded-xl bg-[#004ac6] hover:bg-[#003ea8] text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Aplicar Link
                </button>
              </div>
            )}

            {imageError && (
              <p role="alert" className="text-xs font-bold text-[#ba1a1a]">
                {imageError}
              </p>
            )}
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
                    onClick={() => {
                      categoryDirtyRef.current = true;
                      setCategory(cat);
                    }}
                    className={`px-3.5 py-2 rounded-full text-xs font-bold transition-all min-h-[38px] cursor-pointer ${
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
                onChange={(e) => {
                  brandDirtyRef.current = e.target.value.trim().length > 0;
                  setBrand(e.target.value);
                }}
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
                  onChange={(e) => {
                    weightDirtyRef.current = e.target.value.trim().length > 0;
                    setWeightLabel(e.target.value);
                  }}
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
              className="w-full h-14 bg-[#006e2d] hover:bg-[#005320] disabled:opacity-60 text-white rounded-xl font-extrabold text-sm md:text-base uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
            >
              <CloudUpload className="w-5 h-5" />
              <span>
                {saving
                  ? 'Gravando...'
                  : syncMode === 'cloud'
                    ? 'Salvar Produto na Nuvem'
                    : 'Salvar Produto na Conta Local'}
              </span>
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-11 rounded-xl text-xs font-bold text-[#434655] hover:bg-[#eaedff] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                      className="h-11 px-4 rounded-xl text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Excluir</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDelete(existingProduct.barcode)}
                      className="h-11 px-4 rounded-xl text-xs font-bold bg-[#ba1a1a] text-white flex items-center gap-1.5 cursor-pointer"
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
