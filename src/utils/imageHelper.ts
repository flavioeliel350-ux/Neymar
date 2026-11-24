export const MAX_IMAGE_DATA_URI_CHARS = 75000;
export const MAX_HTTPS_IMAGE_URL_CHARS = 2000;

const DATA_IMAGE_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validates and normalizes an external HTTPS image URL.
 * Returns the cleaned URL or null if invalid.
 */
export function validateHttpsImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_HTTPS_IMAGE_URL_CHARS) return null;
  if (/[\r\n\s]/.test(trimmed)) return null;
  if (!trimmed.startsWith('https://')) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Sanitizes product imageUrl strictly matching Firestore rules:
 * - empty string (removed/none)
 * - https:// URL (<= 2000 chars)
 * - compressed base64 data:image/(jpeg|png|webp) (<= 78000 chars)
 */
export function sanitizeProductImageUrl(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const validHttps = validateHttpsImageUrl(trimmed);
  if (validHttps) return validHttps;

  if (DATA_IMAGE_REGEX.test(trimmed) && trimmed.length <= 78000) {
    return trimmed;
  }

  return '';
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao ler arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an uploaded/captured image file into a compact JPEG data URI
 * bounded strictly below 75,000 characters so it syncs reliably in Firestore
 * and works offline in IndexedDB/localStorage.
 */
export async function compressImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('A imagem selecionada excede o limite de 15 MB.');
  }

  let objectUrl: string | null = null;
  let img: HTMLImageElement;

  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      objectUrl = URL.createObjectURL(file);
      img = await loadImageElement(objectUrl);
    } else {
      const rawUrl = await readFileAsDataUrl(file);
      img = await loadImageElement(rawUrl);
    }
  } catch {
    const rawUrl = await readFileAsDataUrl(file);
    img = await loadImageElement(rawUrl);
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const naturalWidth = img.naturalWidth || img.width || 1;
  const naturalHeight = img.naturalHeight || img.height || 1;

  const attempts: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 320, quality: 0.78 },
    { maxDim: 320, quality: 0.65 },
    { maxDim: 320, quality: 0.52 },
    { maxDim: 240, quality: 0.68 },
    { maxDim: 240, quality: 0.52 },
    { maxDim: 180, quality: 0.45 },
  ];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Seu navegador não suporta processamento de imagem.');
  }

  for (const { maxDim, quality } of attempts) {
    const scale = Math.min(1, maxDim / Math.max(naturalWidth, naturalHeight));
    const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(naturalHeight * scale));

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (
      dataUrl.length <= MAX_IMAGE_DATA_URI_CHARS &&
      DATA_IMAGE_REGEX.test(dataUrl)
    ) {
      return dataUrl;
    }
  }

  throw new Error(
    'Não foi possível compactar esta imagem o suficiente. Tente outra foto ou um link HTTPS.',
  );
}
