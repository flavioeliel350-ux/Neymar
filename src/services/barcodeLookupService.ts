import { BarcodeLookupResult, Category } from '../types/product';

const lookupCache = new Map<string, BarcodeLookupResult | null>();

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_pt?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
}

interface OpenFoodFactsResponse {
  status?: number;
  product?: OpenFoodFactsProduct;
}

function inferCategory(tags: string[] | undefined, name: string): Category {
  const haystack = `${(tags || []).join(' ')} ${name}`.toLowerCase();

  if (
    /beverage|drink|soda|juice|water|beer|wine|coffee|tea|milk|refrigerante|suco|agua|água|cerveja|leite|bebida/.test(
      haystack,
    )
  ) {
    return 'Bebidas';
  }
  if (
    /cleaning|detergent|soap|bleach|limpeza|detergente|sabao|sabão|amaciante|desinfetante|higiene/.test(
      haystack,
    )
  ) {
    return 'Limpeza';
  }
  if (
    /cheese|ham|meat|yogurt|dairy|butter|sausage|queijo|presunto|iogurte|manteiga|frios|laticinio/.test(
      haystack,
    )
  ) {
    return 'Frios';
  }
  if (
    /bread|bakery|cake|pastry|pao|pão|bolo|padaria|torrada/.test(haystack)
  ) {
    return 'Padaria';
  }
  if (
    /food|snack|rice|bean|pasta|sugar|flour|cookie|biscuit|chocolate|oil|arroz|feijao|feijão|macarrao|macarrão|biscoito|cafe|café|acucar|açúcar|oleo|óleo/.test(
      haystack,
    )
  ) {
    return 'Mercearia';
  }
  return 'Outros';
}

async function fetchFromEndpoint(
  baseUrl: string,
  barcode: string,
  source: BarcodeLookupResult['source'],
): Promise<BarcodeLookupResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const url = `${baseUrl}/api/v2/product/${encodeURIComponent(
      barcode,
    )}.json?fields=product_name,product_name_pt,generic_name,brands,quantity,categories_tags`;
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as OpenFoodFactsResponse;
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const rawName = (p.product_name_pt || p.product_name || p.generic_name || '').trim();
    if (!rawName) return null;

    const weightLabel = (p.quantity || '').trim().slice(0, 24) || undefined;
    const brandRaw = (p.brands || '')
      .split(',')[0]
      .trim()
      .slice(0, 60);

    const formattedName =
      weightLabel && !rawName.toLowerCase().includes(weightLabel.toLowerCase())
        ? `${rawName} ${weightLabel}`.slice(0, 120)
        : rawName.slice(0, 120);

    return {
      barcode,
      name: formattedName,
      brand: brandRaw || undefined,
      weightLabel,
      category: inferCategory(p.categories_tags, formattedName),
      source,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function lookupProductByBarcode(
  rawBarcode: string,
): Promise<BarcodeLookupResult | null> {
  const barcode = rawBarcode.trim().replace(/\s+/g, '');
  if (!/^\d{8,14}$/.test(barcode)) {
    return null;
  }

  if (lookupCache.has(barcode)) {
    return lookupCache.get(barcode) ?? null;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  const foodResult = await fetchFromEndpoint(
    'https://world.openfoodfacts.org',
    barcode,
    'Open Food Facts',
  );
  if (foodResult) {
    lookupCache.set(barcode, foodResult);
    return foodResult;
  }

  const productResult = await fetchFromEndpoint(
    'https://world.openproductsfacts.org',
    barcode,
    'Open Products Facts',
  );
  lookupCache.set(barcode, productResult);
  return productResult;
}
