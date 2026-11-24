import { useEffect, useRef } from 'react';
import { BARCODE_CONFIG } from '../config/appConfig';

interface UseBarcodeKeyboardScannerOptions {
  enabled: boolean;
  onScan: (barcode: string) => void;
}

/**
 * Detecta leitores físicos USB/Bluetooth (modo teclado HID), que enviam
 * caracteres em rajada rápida (< 75ms entre teclas) seguidos de Enter.
 * Não interfere com digitação normal em campos de formulário.
 */
export function useBarcodeKeyboardScanner({
  enabled,
  onScan,
}: UseBarcodeKeyboardScannerOptions): void {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isFormInput =
        tag === 'input' || tag === 'textarea' || Boolean(target?.isContentEditable);

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        const looksLikeHidBurst =
          code.length >= BARCODE_CONFIG.hidMinLength &&
          elapsed <= BARCODE_CONFIG.hidMaxKeyIntervalMs * 2;

        bufferRef.current = '';
        lastKeyTimeRef.current = 0;

        // Se o foco já estiver em um input, deixamos o submit do formulário tratar,
        // exceto se o input não tiver tratamento próprio (data-hid-ignore="false").
        if (looksLikeHidBurst && !isFormInput) {
          e.preventDefault();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1 && /^[a-zA-Z0-9\-_]$/.test(e.key)) {
        if (elapsed > BARCODE_CONFIG.hidMaxKeyIntervalMs) {
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
        lastKeyTimeRef.current = now;
      } else if (e.key !== 'Shift') {
        bufferRef.current = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled]);
}
