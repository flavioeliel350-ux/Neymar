import { appLogger, BARCODE_CONFIG } from '../config/appConfig';
import {
  getCachedBarcodeLookup,
  saveCachedBarcodeLookup,
} from '../database/productRepository';
import { BarcodeLookupResult, Category } from '../types/product';
import { inferUnitFromQuantityText } from '../utils/stockUnit';

interface MemoryMissEntry {
  at: number;
}

const memoryHitCache = new Map<string, BarcodeLookupResult>();
const memoryMissCache = new Map<string, MemoryMissEntry>();
const MEMORY_MISS_TTL_MS = 5 * 60 * 1000;

interface OpenFactsProduct {
  product_name?: string;
  product_name_pt?: string;
  generic_name?: string;
  generic_name_pt?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  image_front_small_url?: string;
  image_front_url?: string;
  image_url?: string;
}

interface OpenFactsResponse {
  status?: number;
  product?: OpenFactsProduct;
}

const PORTUGUESE_MINOR_WORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'por',
  'sem',
]);

const UNIT_CASE_MAP: Record<string, string> = {
  ml: 'ml',
  l: 'L',
  lt: 'L',
  g: 'g',
  gr: 'g',
  kg: 'kg',
  mg: 'mg',
  un: 'un',
  und: 'un',
  cx: 'cx',
  pct: 'pct',
  fd: 'fd',
};

function inferCategory(tags: string[] | undefined, name: string): Category {
  const haystack = `${(tags || []).join(' ')} ${name}`.toLowerCase();

  if (
    /beverage|drink|soda|juice|water|beer|wine|coffee|tea|milk|refrigerante|suco|agua|água|cerveja|leite|bebida|energetico|energético/.test(
      haystack,
    )
  ) {
    return 'Bebidas';
  }
  if (
    /cleaning|detergent|soap|bleach|shampoo|toothpaste|cosmetic|beauty|hygiene|limpeza|detergente|sabao|sabão|sabonete|amaciante|desinfetante|higiene|perfumaria|creme|desodorante/.test(
      haystack,
    )
  ) {
    return 'Limpeza';
  }
  if (
    /cheese|ham|meat|yogurt|dairy|butter|sausage|queijo|presunto|iogurte|manteiga|frios|laticinio|requeijao|requeijão/.test(
      haystack,
    )
  ) {
    return 'Frios';
  }
  if (/bread|bakery|cake|pastry|pao|pão|bolo|padaria|torrada/.test(haystack)) {
    return 'Padaria';
  }
  if (
    /food|snack|rice|bean|pasta|sugar|flour|cookie|biscuit|chocolate|oil|arroz|feijao|feijão|macarrao|macarrão|biscoito|cafe|café|acucar|açúcar|oleo|óleo|molho|farinha/.test(
      haystack,
    )
  ) {
    return 'Mercearia';
  }
  return 'Outros';
}

function sanitizeHttpsUrl(raw: string | undefined): string | undefined {
  const trimmed = (raw || '').trim();
  if (!trimmed.startsWith('https://')) return undefined;
  return trimmed.slice(0, 500);
}

function normalizeSmartTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';

  const letters = collapsed.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const upperRatio =
    letters.length > 0
      ? (letters.match(/[A-ZÀ-ÖØ-Þ]/g)?.length || 0) / letters.length
      : 0;
  const isAllLower = letters.length > 0 && collapsed === collapsed.toLowerCase();
  const isMessyCaps = letters.length >= 4 && (upperRatio > 0.72 || isAllLower);

  const tokens = collapsed.split(' ');
  const normalizedTokens = tokens.map((token, idx) => {
    // Normalize measurement tokens like "500G" -> "500g", "1,5L" -> "1,5L"
    const unitJoinedMatch = token.match(/^(\d+(?:[.,]\d+)?)(ml|lt|l|kg|mg|gr|g|un|und|cx|pct|fd)$/i);
    if (unitJoinedMatch) {
      const unitLower = unitJoinedMatch[2].toLowerCase();
      return `${unitJoinedMatch[1]}${UNIT_CASE_MAP[unitLower] || unitLower}`;
    }

    const lower = token.toLowerCase();
    if (UNIT_CASE_MAP[lower] && idx > 0) {
      return UNIT_CASE_MAP[lower];
    }

    if (!isMessyCaps) {
      return token;
    }

    if (idx > 0 && PORTUGUESE_MINOR_WORDS.has(lower)) {
      return lower;
    }

    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return normalizedTokens.join(' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanProductNameAndWeight(
  rawNameInput: string,
  rawBrandInput: string,
  rawQuantityInput: string,
): { name: string; brand?: string; weightLabel?: string } {
  let cleanName = normalizeSmartTitle(rawNameInput);
  const cleanBrand = normalizeSmartTitle(rawBrandInput.split(',')[0] || '').slice(0, 60);
  const cleanWeight = rawQuantityInput
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s+(ml|l|g|kg|mg)\b/gi, (_, num, u) => {
      const lower = String(u).toLowerCase();
      return `${num}${UNIT_CASE_MAP[lower] || lower}`;
    })
    .trim()
    .slice(0, 24);

  if (cleanBrand) {
    // Remove duplicated consecutive brand occurrences (e.g. "Nestlé Nestlé Nescau" -> "Nestlé Nescau")
    const escapedBrand = escapeRegExp(cleanBrand);
    const dupBrandRegex = new RegExp(`\\b(${escapedBrand})\\s+\\1\\b`, 'gi');
    cleanName = cleanName.replace(dupBrandRegex, '$1').trim();

    // Remove trailing "- Brand" if the brand already appears earlier in the name
    const trailingBrandRegex = new RegExp(`\\s*[-–|]\\s*${escapedBrand}$`, 'i');
    if (
      trailingBrandRegex.test(cleanName) &&
      cleanName.replace(trailingBrandRegex, '').toLowerCase().includes(cleanBrand.toLowerCase())
    ) {
      cleanName = cleanName.replace(trailingBrandRegex, '').trim();
    }
  }

  if (cleanWeight) {
    const compactName = cleanName.toLowerCase().replace(/\s+/g, '');
    const compactWeight = cleanWeight.toLowerCase().replace(/\s+/g, '');
    if (!compactName.includes(compactWeight)) {
      cleanName = `${cleanName} ${cleanWeight}`.trim();
    }
  }

  return {
    name: cleanName.slice(0, 120),
    brand: cleanBrand || undefined,
    weightLabel: cleanWeight || undefined,
  };
}

async function fetchFromEndpoint(
  baseUrl: string,
  barcode: string,
  source: BarcodeLookupResult['source'],
): Promise<{ found: BarcodeLookupResult | null; networkOk: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BARCODE_CONFIG.lookupTimeoutMs);

  try {
    const fields =
      'product_name_pt,product_name,generic_name_pt,generic_name,brands,quantity,categories_tags,image_front_small_url,image_front_url,image_url';
    const url = `${baseUrl}/api/v0/product/${encodeURIComponent(barcode)}.json?fields=${fields}`;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return { found: null, networkOk: res.status === 404 };
    }

    const json = (await res.json()) as OpenFactsResponse;
    if (json.status !== 1 || !json.product) {
      return { found: null, networkOk: true };
    }

    const p = json.product;
    const rawName = (
      p.product_name_pt ||
      p.product_name ||
      p.generic_name_pt ||
      p.generic_name ||
      ''
    ).trim();
    if (!rawName) {
      return { found: null, networkOk: true };
    }

    const cleaned = cleanProductNameAndWeight(
      rawName,
      p.brands || '',
      p.quantity || '',
    );
    if (!cleaned.name) {
      return { found: null, networkOk: true };
    }

    const imageUrl =
      sanitizeHttpsUrl(p.image_front_small_url) ||
      sanitizeHttpsUrl(p.image_front_url) ||
      sanitizeHttpsUrl(p.image_url);

    const suggestedUnit = inferUnitFromQuantityText(
      cleaned.weightLabel || cleaned.name,
    );

    return {
      networkOk: true,
      found: {
        barcode,
        name: cleaned.name,
        brand: cleaned.brand,
        weightLabel: cleaned.weightLabel,
        suggestedUnit,
        category: inferCategory(p.categories_tags, cleaned.name),
        imageUrl,
        source,
      },
    };
  } catch (err) {
    appLogger.warn('BarcodeLookup', `Falha ou timeout consultando ${source} para ${barcode}`, err);
    return { found: null, networkOk: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function lookupProductByBarcode(
  rawBarcode: string,
  bypassMissCache = false,
): Promise<BarcodeLookupResult | null> {
  const barcode = rawBarcode.trim().replace(/\s+/g, '');
  if (!/^\d{8,14}$/.test(barcode)) {
    return null;
  }

  // 1. Memória instantânea
  const memHit = memoryHitCache.get(barcode);
  if (memHit) {
    return memHit;
  }

  // 2. Cache persistente local (IndexedDB / LocalStorage) — funciona mesmo offline
  const persistedHit = await getCachedBarcodeLookup(barcode);
  if (persistedHit) {
    memoryHitCache.set(barcode, persistedHit);
    return persistedHit;
  }

  if (!bypassMissCache) {
    const miss = memoryMissCache.get(barcode);
    if (miss && Date.now() - miss.at < MEMORY_MISS_TTL_MS) {
      return null;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  // 3. Cascata de APIs públicas:
  //    Fonte primária: Open Food Facts (alimentos e bebidas, prioridade PT-BR)
  const primary = await fetchFromEndpoint(
    'https://world.openfoodfacts.org',
    barcode,
    'Open Food Facts',
  );
  if (primary.found) {
    memoryHitCache.set(barcode, primary.found);
    memoryMissCache.delete(barcode);
    void saveCachedBarcodeLookup(barcode, primary.found);
    return primary.found;
  }

  //    Fontes secundárias em paralelo curto: Open Beauty Facts + Open Products Facts
  const [beautyRes, productsRes] = await Promise.all([
    fetchFromEndpoint(
      'https://world.openbeautyfacts.org',
      barcode,
      'Open Beauty Facts',
    ),
    fetchFromEndpoint(
      'https://world.openproductsfacts.org',
      barcode,
      'Open Products Facts',
    ),
  ]);

  const secondaryHit = beautyRes.found || productsRes.found;
  if (secondaryHit) {
    memoryHitCache.set(barcode, secondaryHit);
    memoryMissCache.delete(barcode);
    void saveCachedBarcodeLookup(barcode, secondaryHit);
    return secondaryHit;
  }

  // Só memoriza ausência temporária se todas as bases responderam sem erro de rede
  if (primary.networkOk && beautyRes.networkOk && productsRes.networkOk) {
    memoryMissCache.set(barcode, { at: Date.now() });
  }

  return null;
}
