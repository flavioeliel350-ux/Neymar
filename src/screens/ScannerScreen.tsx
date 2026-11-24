import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Delete,
  Edit3,
  Flashlight,
  FlashlightOff,
  Focus,
  Keyboard,
  Lock,
  PackageOpen,
  RefreshCw,
  ScanBarcode,
  ScanLine,
  Search,
  Sparkles,
  Usb,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BARCODE_CONFIG } from '../config/appConfig';
import { lookupProductByBarcode } from '../services/barcodeLookupService';
import { BarcodeLookupResult, Product, ScannerMode } from '../types/product';
import { formatBRL, playBeep, triggerHaptic } from '../utils/feedback';

interface ScannerScreenProps {
  mode: ScannerMode;
  products: Product[];
  canEditPrices: boolean;
  findByBarcode: (barcode: string) => Product | null;
  onChangeMode: (mode: ScannerMode) => void;
  onScanResolved: (barcode: string, mode: ScannerMode) => void;
  onBack: () => void;
}

const RETAIL_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
];

export function ScannerScreen({
  mode,
  products,
  canEditPrices,
  findByBarcode,
  onChangeMode,
  onScanResolved,
  onBack,
}: ScannerScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);
  const pauseUntilRef = useRef<number>(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usbInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'fallback'>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [focusPulse, setFocusPulse] = useState(false);
  const [scanPausedNotice, setScanPausedNotice] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [focusedBarcode, setFocusedBarcode] = useState<string>('');
  const [notFoundAlert, setNotFoundAlert] = useState<string | null>(null);
  const [externalPreview, setExternalPreview] = useState<BarcodeLookupResult | null>(null);

  const [usbQuickInput, setUsbQuickInput] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const focusedProduct = useMemo(
    () => (focusedBarcode ? findByBarcode(focusedBarcode) : null),
    [focusedBarcode, findByBarcode],
  );

  const storeQuickItems = useMemo(() => products.slice(0, 6), [products]);

  const prefetchExternalInfo = useCallback(async (barcode: string) => {
    setExternalPreview(null);
    const info = await lookupProductByBarcode(barcode);
    if (info) {
      setExternalPreview(info);
    }
  }, []);

  const processBarcode = useCallback(
    (code: string, immediate = false) => {
      const clean = code.trim().replace(/\s+/g, '');
      if (!clean) return;

      const now = Date.now();
      // Proteção síncrona contra múltiplos callbacks no mesmo milissegundo
      if (!immediate) {
        if (now < pauseUntilRef.current) {
          return;
        }
        if (
          lastScannedRef.current &&
          lastScannedRef.current.code === clean &&
          now - lastScannedRef.current.at < BARCODE_CONFIG.scanCooldownMs
        ) {
          return;
        }
      }

      lastScannedRef.current = { code: clean, at: now };
      pauseUntilRef.current = now + BARCODE_CONFIG.postScanBriefPauseMs;
      setScanPausedNotice(true);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = setTimeout(() => {
        setScanPausedNotice(false);
      }, BARCODE_CONFIG.postScanBriefPauseMs);

      setFocusedBarcode(clean);
      triggerHaptic(40);

      const exists = findByBarcode(clean);
      if (mode === 'query' && !exists) {
        if (soundEnabled) playBeep('error');
        setNotFoundAlert(clean);
        void prefetchExternalInfo(clean);
        return;
      }

      if (soundEnabled) playBeep('success');
      setNotFoundAlert(null);
      setExternalPreview(null);
      onScanResolved(clean, mode);
    },
    [findByBarcode, mode, onScanResolved, prefetchExternalInfo, soundEnabled],
  );

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  // Initialize ZXing camera reader with explicit retail barcode hints + capability detection
  useEffect(() => {
    let cancelled = false;

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: BARCODE_CONFIG.postScanBriefPauseMs,
    });

    async function startCamera() {
      setCameraStatus('starting');
      setTorchOn(false);
      setTorchSupported(false);
      setFocusSupported(false);

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

        // Inspect hardware camera capabilities (torch / autofocus)
        try {
          const stream = videoEl.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()?.[0];
          const caps = (track?.getCapabilities?.() || {}) as Record<string, unknown>;
          setTorchSupported(Boolean(caps.torch));

          const modes = Array.isArray(caps.focusMode) ? (caps.focusMode as string[]) : [];
          if (modes.includes('continuous') || modes.includes('single-shot')) {
            setFocusSupported(true);
            if (modes.includes('continuous') && track?.applyConstraints) {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              });
            }
          }
        } catch {
          // Hardware capability inspection is optional
        }
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
      setTorchOn(false);
    }
  };

  const handleRefocus = async () => {
    setFocusPulse(true);
    triggerHaptic(15);
    setTimeout(() => setFocusPulse(false), 600);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()?.[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
        });
        setTimeout(() => {
          track
            .applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
            .catch(() => {});
        }, 700);
      }
    } catch {
      // Focus constraint unsupported on some webcams
    }
  };

  const handleUsbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = usbQuickInput.trim();
    if (!cleaned) return;
    setUsbQuickInput('');
    processBarcode(cleaned, true);
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
              onClick={handleRefocus}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                cameraStatus === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />

            {/* Fallback View when camera permission unavailable */}
            {cameraStatus !== 'active' && (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e1b4b] flex items-center justify-center px-4">
                <div className="w-full max-w-xs rounded-xl bg-white/95 p-4 shadow-xl border border-white/20 flex flex-col items-center gap-2 text-center">
                  <ScanBarcode className="w-8 h-8 text-[#2563eb]" />
                  <p className="text-xs font-extrabold text-[#131b2e]">
                    {cameraStatus === 'starting'
                      ? 'Iniciando câmera...'
                      : 'Câmera indisponível neste dispositivo'}
                  </p>
                  <p className="text-[11px] text-[#434655] leading-snug">
                    {focusedBarcode
                      ? `Código em foco: ${focusedBarcode}`
                      : 'Use um leitor USB/Bluetooth ou digite o código manualmente.'}
                  </p>
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
                  className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                {/* Mode Segmented Switch */}
                <div className="inline-flex p-1 rounded-full bg-black/60 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setNotFoundAlert(null);
                      setExternalPreview(null);
                      onChangeMode('query');
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
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
                      setExternalPreview(null);
                      onChangeMode('register');
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                      mode === 'register'
                        ? 'bg-[#007b71] text-white'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {canEditPrices ? (
                      <Edit3 className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>Cadastro</span>
                  </button>
                </div>

                {/* Focus, Torch, Camera Flip & Audio */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {focusSupported && cameraStatus === 'active' && (
                    <button
                      type="button"
                      onClick={handleRefocus}
                      aria-label="Focar câmera"
                      title="Refocar lente"
                      className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                        focusPulse
                          ? 'bg-[#7ffc97] text-[#002109]'
                          : 'bg-black/50 text-white hover:bg-black/70'
                      }`}
                    >
                      <Focus className="w-4 h-4" />
                    </button>
                  )}

                  {(torchSupported || cameraStatus === 'active') && (
                    <button
                      type="button"
                      onClick={handleToggleTorch}
                      disabled={!torchSupported && cameraStatus !== 'active'}
                      aria-label={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
                      title={torchSupported ? 'Lanterna' : 'Lanterna (se suportada)'}
                      className={`w-10 h-10 rounded-full backdrop-blur-md flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
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
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    aria-label="Alternar câmera"
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSoundEnabled((prev) => !prev)}
                    aria-label={soundEnabled ? 'Silenciar bip' : 'Ativar som do bip'}
                    className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all cursor-pointer"
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
                  {scanPausedNotice
                    ? 'Leitura confirmada · Pausa anti-duplicidade'
                    : cameraStatus === 'active'
                      ? 'Câmera Ao Vivo · EAN / UPC / Code 128 / QR'
                      : 'Pronto para Leitor USB ou Digitação Manual'}
                </span>
              </div>
            </div>

            {/* Center Target Reticle (tap to focus) */}
            <div
              onClick={cameraStatus === 'active' ? handleRefocus : undefined}
              className="relative z-10 flex flex-col items-center justify-center my-6"
            >
              <div
                className={`relative w-64 sm:w-72 h-44 flex items-center justify-center transition-transform ${
                  focusPulse ? 'scale-95' : 'scale-100'
                }`}
              >
                <div className="absolute top-1 left-2 right-2 h-0.5 bg-[#7ffc97] shadow-[0_0_12px_3px_rgba(127,252,151,0.85)] animate-scan-laser rounded-full" />

                <div className="absolute top-0 left-0 w-7 h-7 border-t-[3.5px] border-l-[3.5px] border-[#7ffc97] rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-[3.5px] border-r-[3.5px] border-[#7ffc97] rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3.5px] border-l-[3.5px] border-[#7ffc97] rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3.5px] border-r-[3.5px] border-[#7ffc97] rounded-br-lg" />

                <div className="absolute -top-3.5 px-3 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{scanPausedNotice ? 'Bip Registrado' : 'Alinhe na moldura'}</span>
                </div>
              </div>

              <div className="mt-4 max-w-xs px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-center">
                <p className="text-xs text-white/95 leading-snug">
                  Suporta <strong className="text-[#7ffc97]">EAN-13, EAN-8, UPC, Code 128 e QR</strong>.
                  {cameraStatus === 'active' && focusSupported
                    ? ' Toque na tela para refocar.'
                    : ''}
                </p>
              </div>
            </div>

            {/* Bottom Detection Card & Controls */}
            <div className="relative z-20 flex flex-col gap-2.5">
              {notFoundAlert && (
                <div className="rounded-xl bg-[#ffdad6] text-[#93000a] p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold">Produto ainda não cadastrado na loja</p>
                    <p className="font-mono text-xs truncate">Código: {notFoundAlert}</p>
                    {externalPreview && (
                      <p className="text-[11px] font-semibold text-[#005320] mt-0.5 flex items-center gap-1 truncate">
                        <Sparkles className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          Identificado: {externalPreview.name}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onScanResolved(notFoundAlert, 'register')}
                    className="px-3 py-2 rounded-lg bg-[#ba1a1a] text-white text-xs font-bold whitespace-nowrap shrink-0 hover:brightness-90 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {!canEditPrices && <Lock className="w-3.5 h-3.5" />}
                    <span>{canEditPrices ? 'Cadastrar Agora' : 'Gerente (PIN)'}</span>
                  </button>
                </div>
              )}

              {/* Live Identified Code Card */}
              <div className="rounded-xl bg-white/95 backdrop-blur-md p-3.5 text-[#131b2e] shadow-lg">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold uppercase tracking-wider text-[#434655]">
                    Leitura Atual
                  </span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-md ${
                      !focusedBarcode
                        ? 'bg-[#eaedff] text-[#434655]'
                        : focusedProduct
                          ? 'bg-[#dcfce7] text-[#006e2d]'
                          : 'bg-[#fef3c7] text-[#b45309]'
                    }`}
                  >
                    {!focusedBarcode
                      ? 'Aguardando código'
                      : focusedProduct
                        ? 'No Catálogo'
                        : 'Não Cadastrado'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-extrabold tracking-wider text-[#131b2e]">
                      {focusedBarcode || '— — — — — — — —'}
                    </p>
                    <p className="text-xs text-[#434655] truncate">
                      {focusedProduct
                        ? focusedProduct.name
                        : focusedBarcode
                          ? externalPreview?.name || 'Toque em Cadastrar para preencher preço e estoque'
                          : 'Aponte a câmera, use o leitor USB ou digite o código'}
                    </p>
                  </div>

                  {focusedBarcode && (
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-[#434655] block">
                        {focusedProduct ? 'Preço Varejo' : 'Ação'}
                      </span>
                      <span className="text-base font-extrabold text-[#006e2d] tabular-nums">
                        {focusedProduct ? formatBRL(focusedProduct.price) : 'Novo'}
                      </span>
                    </div>
                  )}
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
                  className="flex-1 h-12 rounded-xl bg-white hover:bg-[#f2f3ff] text-[#131b2e] font-bold text-sm flex items-center justify-center gap-2 shadow active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Keyboard className="w-4 h-4 text-[#2563eb]" />
                  <span>Digitar Código</span>
                </button>
                {focusedBarcode && (
                  <button
                    type="button"
                    onClick={() => processBarcode(focusedBarcode, true)}
                    className={`h-12 px-6 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 shadow active:scale-[0.98] transition-all cursor-pointer ${
                      mode === 'query'
                        ? 'bg-[#2563eb] hover:bg-[#004ac6]'
                        : 'bg-[#007b71] hover:bg-[#006058]'
                    }`}
                  >
                    <ScanLine className="w-4 h-4" />
                    <span>{mode === 'query' ? 'Consultar' : 'Cadastrar'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols on desktop): USB/Bluetooth Scanner & Active Store Items */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* USB / Bluetooth HID Direct Entry Card */}
          <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#eaedff] text-[#004ac6] flex items-center justify-center shrink-0">
                <Usb className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#131b2e]">
                  Leitor USB / Bluetooth ou Entrada Rápida
                </h2>
                <p className="text-xs text-[#434655]">
                  Bipe com o leitor externo em qualquer tela ou digite e pressione Enter.
                </p>
              </div>
            </div>

            <form onSubmit={handleUsbSubmit} className="flex items-center gap-2">
              <input
                ref={usbInputRef}
                type="text"
                inputMode="numeric"
                value={usbQuickInput}
                onChange={(e) => setUsbQuickInput(e.target.value)}
                placeholder="Aguardando bip USB ou código..."
                className="flex-1 h-11 px-3 rounded-xl bg-[#f2f3ff] border border-[#cbd5e1] focus:border-[#2563eb] focus:bg-white font-mono text-sm font-bold text-[#131b2e] outline-none"
              />
              <button
                type="submit"
                className="h-11 px-4 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold shrink-0 cursor-pointer"
              >
                Bipar
              </button>
            </form>
          </div>

          {/* Active Store Catalog Shortcuts (Real Store Data Only - Zero Seed) */}
          <div className="bg-white rounded-2xl p-4 border border-[#e2e7ff] flex flex-col gap-3">
            <div>
              <h2 className="text-base font-bold text-[#131b2e]">
                Itens Recentes desta Loja
              </h2>
              <p className="text-xs text-[#434655] mt-0.5">
                {storeQuickItems.length > 0
                  ? 'Consulta instantânea sem latência a partir do catálogo local.'
                  : 'Esta loja ainda não possui produtos cadastrados.'}
              </p>
            </div>

            {storeQuickItems.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#f2f3ff] text-center flex flex-col items-center gap-2">
                <PackageOpen className="w-7 h-7 text-[#434655]" />
                <p className="text-xs text-[#434655] leading-relaxed">
                  Bipe um produto novo no modo <strong>Cadastro</strong> ou digite o código acima para preencher nome, marca e foto automaticamente.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {storeQuickItems.map((prod) => {
                  const isSelected = focusedBarcode === prod.barcode;
                  return (
                    <div
                      key={prod.barcode}
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
                          setExternalPreview(null);
                          setFocusedBarcode(prod.barcode);
                        }}
                        className="flex-1 text-left min-w-0 min-h-[40px] cursor-pointer"
                      >
                        <p className="text-sm font-bold text-[#131b2e] truncate">
                          {prod.name}
                        </p>
                        <p className="font-mono text-xs text-[#434655]">
                          {prod.barcode} · {formatBRL(prod.price)}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => processBarcode(prod.barcode, true)}
                        className="px-3 py-2 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold whitespace-nowrap shrink-0 min-h-[38px] cursor-pointer"
                      >
                        Abrir
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
                    Digite os dígitos EAN-13, EAN-8, UPC ou Code 128
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                aria-label="Fechar"
                className="w-9 h-9 rounded-full bg-[#eaedff] flex items-center justify-center text-[#434655] hover:text-[#131b2e] cursor-pointer"
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
                  Código de Barras / SKU
                </label>
                <div className="relative flex items-center">
                  <input
                    id="barcode-manual-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={32}
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
                    className="absolute right-2.5 w-8 h-8 flex items-center justify-center text-[#434655] hover:text-[#131b2e] cursor-pointer"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#004ac6] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
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
