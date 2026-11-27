import { STOCK_UNITS, StockUnit } from '../types/product';

export interface StockUnitInfo {
  code: StockUnit;
  label: string;
  shortLabel: string;
  allowsDecimal: boolean;
  decimals: number;
  step: number;
}

export const STOCK_UNIT_META: Record<StockUnit, StockUnitInfo> = {
  UN: {
    code: 'UN',
    label: 'Unidade (UN)',
    shortLabel: 'UN',
    allowsDecimal: false,
    decimals: 0,
    step: 1,
  },
  CX: {
    code: 'CX',
    label: 'Caixa (CX)',
    shortLabel: 'CX',
    allowsDecimal: false,
    decimals: 0,
    step: 1,
  },
  PCT: {
    code: 'PCT',
    label: 'Pacote (PCT)',
    shortLabel: 'PCT',
    allowsDecimal: false,
    decimals: 0,
    step: 1,
  },
  FD: {
    code: 'FD',
    label: 'Fardo (FD)',
    shortLabel: 'FD',
    allowsDecimal: false,
    decimals: 0,
    step: 1,
  },
  KG: {
    code: 'KG',
    label: 'Quilograma (KG)',
    shortLabel: 'KG',
    allowsDecimal: true,
    decimals: 3,
    step: 0.5,
  },
  G: {
    code: 'G',
    label: 'Grama (G)',
    shortLabel: 'G',
    allowsDecimal: true,
    decimals: 1,
    step: 50,
  },
  L: {
    code: 'L',
    label: 'Litro (L)',
    shortLabel: 'L',
    allowsDecimal: true,
    decimals: 3,
    step: 0.5,
  },
  ML: {
    code: 'ML',
    label: 'Mililitro (ML)',
    shortLabel: 'ML',
    allowsDecimal: true,
    decimals: 1,
    step: 50,
  },
};

export function normalizeStockUnit(raw: unknown): StockUnit {
  if (typeof raw === 'string') {
    const upper = raw.trim().toUpperCase();
    if ((STOCK_UNITS as string[]).includes(upper)) {
      return upper as StockUnit;
    }
  }
  return 'UN';
}

export function isDecimalStockUnit(unit?: StockUnit): boolean {
  const safe = normalizeStockUnit(unit);
  return STOCK_UNIT_META[safe].allowsDecimal;
}

export function clampStockByUnit(value: number, unit?: StockUnit): number {
  const safe = normalizeStockUnit(unit);
  const meta = STOCK_UNIT_META[safe];
  if (!Number.isFinite(value) || value < 0) return 0;
  const bounded = Math.min(1000000, Math.max(0, value));
  if (!meta.allowsDecimal) {
    return Math.round(bounded);
  }
  const factor = Math.pow(10, meta.decimals);
  return Math.round(bounded * factor) / factor;
}

export function parseStockInput(
  raw: string,
  unit?: StockUnit,
): { valid: boolean; value: number; error?: string } {
  const safeUnit = normalizeStockUnit(unit);
  const allowsDecimal = isDecimalStockUnit(safeUnit);
  const trimmed = raw.trim();

  if (!trimmed) {
    return { valid: false, value: 0, error: 'Informe uma quantidade.' };
  }
  if (trimmed.startsWith('-')) {
    return { valid: false, value: 0, error: 'A quantidade não pode ser negativa.' };
  }

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return {
      valid: false,
      value: 0,
      error: allowsDecimal
        ? 'Digite um número válido (ex: 1,500).'
        : 'Digite um número inteiro válido (ex: 24).',
    };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { valid: false, value: 0, error: 'Quantidade inválida.' };
  }

  if (!allowsDecimal && !Number.isInteger(parsed)) {
    return {
      valid: false,
      value: 0,
      error: `A unidade ${safeUnit} aceita apenas números inteiros.`,
    };
  }

  return {
    valid: true,
    value: clampStockByUnit(parsed, safeUnit),
  };
}

export function formatStockNumber(stock: number, unit?: StockUnit): string {
  const safeUnit = normalizeStockUnit(unit);
  const meta = STOCK_UNIT_META[safeUnit];
  const safeVal = clampStockByUnit(stock, safeUnit);

  if (!meta.allowsDecimal) {
    return Math.round(safeVal).toLocaleString('pt-BR');
  }

  const hasFraction = Math.abs(safeVal - Math.round(safeVal)) > 0.0001;
  return safeVal.toLocaleString('pt-BR', {
    minimumFractionDigits: hasFraction && meta.decimals === 3 ? 3 : hasFraction ? 1 : 0,
    maximumFractionDigits: meta.decimals,
  });
}

export function formatStockInputText(stock: number, unit?: StockUnit): string {
  const safeUnit = normalizeStockUnit(unit);
  const meta = STOCK_UNIT_META[safeUnit];
  const safeVal = clampStockByUnit(stock, safeUnit);
  if (!meta.allowsDecimal) {
    return String(Math.round(safeVal));
  }
  const hasFraction = Math.abs(safeVal - Math.round(safeVal)) > 0.0001;
  if (!hasFraction) {
    return String(Math.round(safeVal));
  }
  return safeVal.toFixed(meta.decimals).replace('.', ',');
}

export function formatStockWithUnit(stock: number, unit?: StockUnit): string {
  const safeUnit = normalizeStockUnit(unit);
  return `${formatStockNumber(stock, safeUnit)} ${safeUnit}`;
}

export function inferUnitFromQuantityText(rawQuantity?: string): StockUnit | undefined {
  const text = (rawQuantity || '').trim().toLowerCase();
  if (!text) return undefined;

  if (/\b\d+([.,]\d+)?\s*(kg|quilo|quilograma)s?\b/.test(text)) return 'KG';
  if (/\b\d+([.,]\d+)?\s*(mg|g|gr|grama)s?\b/.test(text)) return 'G';
  if (/\b\d+([.,]\d+)?\s*ml\b/.test(text)) return 'ML';
  if (/\b\d+([.,]\d+)?\s*(l|lt|litro)s?\b/.test(text)) return 'L';
  if (/\b(cx|caixa)s?\b/.test(text)) return 'CX';
  if (/\b(pct|pacote)s?\b/.test(text)) return 'PCT';
  if (/\b(fd|fardo)s?\b/.test(text)) return 'FD';
  if (/\b(un|und|unidade)s?\b/.test(text)) return 'UN';

  return undefined;
}
