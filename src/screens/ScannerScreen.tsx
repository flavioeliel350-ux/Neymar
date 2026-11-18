import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Delete,
  Edit3,
  Flashlight,
  FlashlightOff,
  Keyboard,
  RefreshCw,
  ScanLine,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Product, ScannerMode } from '../types/product';
import { formatBRL, playBeep, triggerHaptic } from '../utils/feedback';

interface ScannerScreenProps {
  mode: ScannerMode;
  products: Product[];
  onChangeMode: (mode: ScannerMode) => void;
  onScanResolved: (barcode: string, mode: ScannerMode) => void;
  onBack: () => void;
}

const DEMO_SHELF_CODES = [
  { code: '7891000053508', label: 'Biscoito Maizena 400g' },
  { code: '7891000100103', label: 'Café Pilão 500g' },
  { code: '7891000315507', label: 'Leite Integral 1L' },
  { code: '7894900011517', label: 'Refrigerante Cola 2L' },
  { code: '7899999000999', label: 'Código Novo (Não Cadastrado)' },
];

export function ScannerScreen({
  mode,
  products,
  onChangeMode,
  onScanResolved,
  onBack,
}: ScannerScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'fallback'>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [focusedBarcode, setFocusedBarcode] = useState<string>('7891000053508');
  const [notFoundAlert, setNotFoundAlert] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInput, setManualInput] = useState('7891000100103');

  const focusedProduct = products.find((p) => p.barcode === focusedBarcode) || null;

  const processBarcode = useCallback(
    (code: string, immediate = false) => {
      const clean = code.trim();
      if (!clean) return;

      const now = Date.now();
      if (
        !immediate &&
        lastScannedRef.current &&
        lastScannedRef.current.code === clean &&
        now - lastScannedRef.current.at < 2000
      ) {
        return;
      }
      lastScannedRef.current = { code: clean, at: now };

      setFocusedBarcode(clean);
      triggerHaptic(40);

      const exists = products.find((p) => p.barcode === clean);
      if (mode === 'query' && !exists) {
        if (soundEnabled) playBeep('error');
        setNotFoundAlert(clean);
        return;
      }

      if (soundEnabled) playBeep('success');
      setNotFoundAlert(null);
      onScanResolved(clean, mode);
    },
    [mode, onScanResolved, products, soundEnabled],
  );

  // Initialize real webcam / mobile camera barcode reader via ZXing
  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function startCamera() {
      setCameraStatus('starting');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('fallback');
        return;
      }

      try {
        const videoEl = videoRef.current;
        if (!videoEl) {
          setCameraStatus('fallback');
          return;
        }

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          videoEl,
          (result) => {
            if (cancelled || !result) return;
            const text = result.getText();
            if (text) {
              processBarcode(text);
            }
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCameraStatus('active');
      } catch {
        if (!cancelled) {
          setCameraStatus('fallback');
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // Ignore cleanup failure
        }
        controlsRef.current = null;
      }
    };
  }, [facingMode, processBarcode]);

  const handleToggleTorch = async () => {
    const next = !torchOn;
    setTorchOn(next);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()?.[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Torch constraint is only available on supported mobile hardware
    }
  };

  const handleManualConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualInput.trim();
    if (!cleaned) return;
    setShowManualModal(false);
    processBarcode(cleaned, true);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 md:px-6 py-3 md:py-6 pb-24 md:pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Left Column (7 cols on desktop): Optical Camera Viewfinder Stage */}
        <div className="lg:col-span-7">
          <div className="relative w-full rounded-2xl overflow-hidden bg-[#131b2e] min-h-[500px] sm:min-h-[540px] flex flex-col justify-between p-3.5 md:p-4 select-none shadow-md">
            {/* Live Camera Video Element */}
            <video
              ref={videoRef}
              muted
              playsInline
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                cameraStatus === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Fallback Simulated Retail Shelf Calibration View when webcam isn't attached */}
            {cameraStatus !== 'active' && (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e1b4b] flex items-center justify-center">
                {/* Subtle barcode visual in reticle background for realistic floor preview */}
                <div className="w-64 sm:w-72 rounded-xl bg-white/95 p-4 shadow-xl border border-white/20 flex flex-col items-center gap-2 opacity-90">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#434655]">
                    {focusedProduct ? focusedProduct.brand : 'Leitura Óptica'}
                  </span>
                  <p className="text-xs font-extrabold text-[#131b2e] text-center line-clamp-1">
                    {focusedProduct ? focusedProduct.name : 'Novo Código em Foco'}
                  </p>
                  {/* Realistic SVG EAN-13 Bars */}
                  <div className="w-full h-14 flex items-stretch justify-center gap-[2px] px-3 py-1 bg-white">
                    {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 1].map(
                      (w, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0f172a]"
                          style={{ width: `${w * 2}px` }}
                        />
                      ),
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold tracking-[0.2em] text-[#131b2e]">
                    {focusedBarcode}
                  </span>
                </div>
              </div>
            )}

            {/* Contrast Scrim */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/75 pointer-events-none" />

            {/* Top Floating Scanner Controls */}
            <div className="relative z-20 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Voltar para início"
                  className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Mode Segmented Switch */}
                <div className="inline-flex p-1 rounded-full bg-black/60 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setNotFoundAlert(null);
                      onChangeMode('query');
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      mode === 'query'
                        ? 'bg-[#2563eb] text-white'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Consulta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotFoundAlert(null);
                      onChangeMode('register');
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      mode === 'register'
                        ? 'bg-[#007b71] text-white'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Cadastro</span>
                  </button>
                </div>

                {/* Torch & Camera Flip */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    aria-label={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
                    className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all active:scale-95 ${
                      torchOn
                        ? 'bg-[#7ffc97] text-[#002109]'
                        : 'bg-black/50 text-white hover:bg-black/70'
                    }`}
                  >
                    {torchOn ? (
                      <Flashlight className="w-4 h-4" />
                    ) : (
                      <FlashlightOff className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    aria-label="Alternar câmera"
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((prev) => !prev)}
                    aria-label={soundEnabled ? 'Silenciar bip' : 'Ativar som do bip'}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="self-center px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-bold text-[#7ffc97] tracking-wide flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                <span>
                  {cameraStatus === 'active'
                    ? 'Câmera Ao Vivo · Leitura Automática'
                    : 'Modo Balcão / Simulador Óptico'}
                </span>
              </div>
            </div>

            {/* Center Target Reticle */}
            <div className="relative z-10 flex flex-col items-center justify-center my-6">
              <div className="relative w-64 sm:w-72 h-44 flex items-center justify-center">
                {/* Laser Sweep */}
                <div className="absolute top-1 left-2 right-2 h-0.5 bg-[#7ffc97] shadow-[0_0_12px_3px_rgba(127,252,151,0.85)] animate-scan-laser rounded-full" />

                {/* Corner Brackets */}
                <div className="absolute top-0 left-0 w-7 h-7 border-t-[3.5px] border-l-[3.5px] border-[#7ffc97] rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-[3.5px] border-r-[3.5px] border-[#7ffc97] rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3.5px] border-l-[3.5px] border-[#7ffc97] rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3.5px] border-r-[3.5px] border-[#7ffc97] rounded-br-lg" />

                {/* Top Detection Pill */}
                <div className="absolute -top-3.5 px-3 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Etiqueta no foco</span>
                </div>
              </div>

              <div className="mt-4 max-w-xs px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-center">
                <p className="text-xs text-white/95 leading-snug">
                  Alinhe o código <strong className="text-[#7ffc97]">EAN-13, EAN-8 ou Code 128</strong>{' '}
                  dentro da moldura ou toque em Bipar.
                </p>
              </div>
            </div>

            {/* Bottom Detection Card & Controls */}
            <div className="relative z-20 flex flex-col gap-2.5">
              {/* Not Found Warning Banner */}
              {notFoundAlert && (
                <div className="rounded-xl bg-[#ffdad6] text-[#93000a] p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold">Produto não cadastrado</p>
                    <p className="font-mono text-xs truncate">Código: {notFoundAlert}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onScanResolved(notFoundAlert, 'register')}
                    className="px-3 py-2 rounded-lg bg-[#ba1a1a] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:brightness-90 transition-all"
                  >
                    Cadastrar Agora
                  </button>
                </div>
              )}

              {/* Live Identified Code Card */}
              <div className="rounded-xl bg-white/95 backdrop-blur-md p-3.5 text-[#131b2e] shadow-lg">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold uppercase tracking-wider text-[#434655]">
                    Código Identificado
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      focusedProduct
                        ? 'bg-[#dcfce7] text-[#006e2d]'
                        : 'bg-[#fef3c7] text-[#b45309]'
                    }`}
                  >
                    {focusedProduct ? 'No Catálogo' : 'Não Cadastrado'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-extrabold tracking-wider text-[#131b2e]">
                      {focusedBarcode}
                    </p>
                    <p className="text-xs text-[#434655] truncate">
                      {focusedProduct
                        ? focusedProduct.name
                        : 'Toque em Bipar para cadastrar novo item'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] text-[#434655] block">
                      {focusedProduct ? 'Preço Varejo' : 'Ação'}
                    </span>
                    <span className="text-base font-extrabold text-[#006e2d] tabular-nums">
                      {focusedProduct ? formatBRL(focusedProduct.price) : 'Novo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setManualInput(focusedBarcode);
                    setShowManualModal(true);
                  }}
                  className="flex-1 h-12 rounded-xl bg-white hover:bg-[#f2f3ff] text-[#131b2e] font-bold text-sm flex items-center justify-center gap-2 shadow active:scale-[0.98] transition-all"
                >
                  <Keyboard className="w-4 h-4 text-[#2563eb]" />
                  <span>Digitar Código</span>
                </button>
                <button
                  type="button"
                  onClick={() => processBarcode(focusedBarcode, true)}
                  className={`h-12 px-6 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow active:scale-[0.98] transition-all ${
                    mode === 'query'
                      ? 'bg-[#2563eb] hover:bg-[#004ac6]'
                      : 'bg-[#007b71] hover:bg-[#006058]'
                  }`}
                >
                  <ScanLine className="w-4 h-4" />
                  <span>{mode === 'query' ? 'Bipar' : 'Cadastrar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols on desktop, stacked below on mobile): Quick Test Barcodes & Direct Lookup */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div>
              <h2 className="text-base font-bold text-[#131b2e]">
                Etiquetas Rápidas de Balcão
              </h2>
              <p className="text-xs text-[#434655] mt-0.5">
                Selecione um código de barras para posicionar no foco ou testar leitura instantânea sem webcam.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {DEMO_SHELF_CODES.map((preset) => {
                const isSelected = focusedBarcode === preset.code;
                const prod = products.find((p) => p.barcode === preset.code);
                return (
                  <div
                    key={preset.code}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#f2f3ff] border-[#2563eb]'
                        : 'bg-[#faf8ff] border-[#e2e7ff] hover:bg-[#f2f3ff]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setNotFoundAlert(null);
                        setFocusedBarcode(preset.code);
                      }}
                      className="flex-1 text-left min-w-0 min-h-[40px]"
                    >
                      <p className="text-sm font-bold text-[#131b2e] truncate">
                        {prod ? prod.name : preset.label}
                      </p>
                      <p className="font-mono text-xs text-[#434655]">
                        {preset.code}
                        {prod ? ` · ${formatBRL(prod.price)}` : ' · Não cadastrado'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => processBarcode(preset.code, true)}
                      className="px-3 py-2 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold whitespace-nowrap shrink-0 min-h-[38px]"
                    >
                      Bipar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Barcode Input Modal */}
      {showManualModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-code-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 md:p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#2563eb] flex items-center justify-center text-white">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="manual-code-title" className="text-base font-bold text-[#131b2e]">
                    Inserir Código de Barras
                  </h2>
                  <p className="text-xs text-[#434655]">
                    Digite os dígitos da etiqueta EAN-13 ou EAN-8
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                aria-label="Fechar"
                className="w-9 h-9 rounded-full bg-[#eaedff] flex items-center justify-center text-[#434655] hover:text-[#131b2e]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualConfirm} className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="barcode-manual-input"
                  className="text-xs font-bold text-[#434655] block mb-1"
                >
                  Número EAN / SKU
                </label>
                <div className="relative flex items-center">
                  <input
                    id="barcode-manual-input"
                    type="tel"
                    inputMode="numeric"
                    maxLength={14}
                    autoFocus
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Ex: 7891000100103"
                    className="w-full h-12 pl-3.5 pr-11 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] focus:border-[#2563eb] focus:bg-white text-[#131b2e] font-mono text-base font-bold focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setManualInput('')}
                    aria-label="Limpar código"
                    className="absolute right-2.5 w-8 h-8 flex items-center justify-center text-[#434655] hover:text-[#131b2e]"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {DEMO_SHELF_CODES.slice(0, 3).map((preset) => (
                  <button
                    key={preset.code}
                    type="button"
                    onClick={() => setManualInput(preset.code)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#eaedff] hover:bg-[#dae2fd] text-[#131b2e] font-mono text-[11px] font-semibold"
                  >
                    {preset.code}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Check className="w-4 h-4" />
                <span>
                  {mode === 'query' ? 'Confirmar e Consultar' : 'Confirmar e Cadastrar'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
