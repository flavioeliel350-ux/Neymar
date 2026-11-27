import {
  BarcodeLookupResult,
  LocalAccount,
  Product,
  SaveOperatorInput,
  ScanLog,
  StoreOperator,
  UserRole,
} from '../types/product';
import {
  DEFAULT_MANAGER_PIN,
  hashPin,
  isValidPinFormat,
} from '../utils/pinSecurity';
import { clampStockByUnit, normalizeStockUnit } from '../utils/stockUnit';

const DB_NAME = 'prontopreco_offline_db';
const DB_VERSION = 3;
const STORE_PRODUCTS = 'products_v2';
const STORE_LOGS = 'scan_logs_v2';
const STORE_BARCODE_CACHE = 'barcode_cache_v1';

const LS_ACCOUNTS_KEY = 'prontopreco_local_accounts_v1';
const LS_ACTIVE_ACCOUNT_KEY = 'prontopreco_active_local_account_v1';
const LS_PRODUCTS_PREFIX = 'prontopreco_local_products_v2_';
const LS_LOGS_PREFIX = 'prontopreco_local_logs_v2_';
const LS_BARCODE_CACHE_KEY = 'prontopreco_barcode_lookup_cache_v1';

// Legacy v1 keys cleaned up on upgrade so no demo/seed items leak into new accounts
const LEGACY_LS_KEYS = ['prontopreco_products_v1', 'prontopreco_logs_v1'];

interface StoredProductRecord extends Product {
  id: string;
  accountId: string;
}

interface StoredScanLogRecord extends ScanLog {
  accountId: string;
}

interface StoredBarcodeCacheEntry {
  barcode: string;
  result: BarcodeLookupResult;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (db.objectStoreNames.contains('products')) {
            db.deleteObjectStore('products');
          }
          if (db.objectStoreNames.contains('scan_logs')) {
            db.deleteObjectStore('scan_logs');
          }
          if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
            const pStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
            pStore.createIndex('by_account', 'accountId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_LOGS)) {
            const lStore = db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
            lStore.createIndex('by_account', 'accountId', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_BARCODE_CACHE)) {
            db.createObjectStore(STORE_BARCODE_CACHE, { keyPath: 'barcode' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota exceptions
  }
}

function normalizeRole(raw: unknown): UserRole {
  return raw === 'manager' || raw === 'admin' ? 'manager' : 'operator';
}

function normalizeOperator(
  accountId: string,
  op: Partial<StoreOperator> & { id: string },
): StoreOperator {
  const role = normalizeRole(op.role);
  return {
    id: op.id,
    storeId: op.storeId || accountId,
    ownerId: op.ownerId || accountId,
    name: op.name || (role === 'manager' ? 'Gerente' : 'Operador'),
    code: op.code || 'Op. 01',
    role,
    pinHash: op.pinHash,
    pin: op.pinHash ? undefined : op.pin,
    canConsultPrices: role === 'manager' ? true : op.canConsultPrices !== false,
    canAdjustStock: role === 'manager' ? true : op.canAdjustStock !== false,
    canManageProducts: role === 'manager' ? true : Boolean(op.canManageProducts),
    active: op.active !== false,
  };
}

export async function initDatabase(): Promise<void> {
  try {
    LEGACY_LS_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore storage cleanup error
  }
  await openIDB();
}

// --- Multi-Tenant Local Store Accounts ---

export function getLocalAccounts(): LocalAccount[] {
  const raw = readLocalStorage<LocalAccount[]>(LS_ACCOUNTS_KEY, []);
  return raw.map((acc) => ({
    ...acc,
    operators: Array.isArray(acc.operators)
      ? acc.operators.map((op) => normalizeOperator(acc.id, op))
      : [],
  }));
}

export function getActiveLocalAccountId(): string | null {
  try {
    return localStorage.getItem(LS_ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setActiveLocalAccountId(accountId: string | null): void {
  try {
    if (accountId) {
      localStorage.setItem(LS_ACTIVE_ACCOUNT_KEY, accountId);
    } else {
      localStorage.removeItem(LS_ACTIVE_ACCOUNT_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function createLocalAccount(
  storeName: string,
  managerName = 'Gerente',
  managerPin = DEFAULT_MANAGER_PIN,
): Promise<LocalAccount> {
  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanStoreName = storeName.trim().slice(0, 100) || 'Minha Loja Local';
  const cleanManager = managerName.trim().slice(0, 60) || 'Gerente';
  const cleanPin = isValidPinFormat(managerPin) ? managerPin.trim() : DEFAULT_MANAGER_PIN;
  const pinHash = await hashPin(id, 'op-01', cleanPin);

  // Only the Store Creator (Gerente) is provisioned; no dummy/fictitious operators
  const account: LocalAccount = {
    id,
    storeName: cleanStoreName,
    createdAt: new Date().toISOString(),
    operators: [
      {
        id: 'op-01',
        storeId: id,
        ownerId: id,
        name: cleanManager,
        code: 'Op. 01',
        role: 'manager',
        pinHash,
        canConsultPrices: true,
        canAdjustStock: true,
        canManageProducts: true,
        active: true,
      },
    ],
  };

  const accounts = getLocalAccounts();
  accounts.push(account);
  writeLocalStorage(LS_ACCOUNTS_KEY, accounts);
  setActiveLocalAccountId(id);
  return account;
}

export function updateLocalAccountStoreName(
  accountId: string,
  storeName: string,
): LocalAccount | null {
  const accounts = getLocalAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) return null;
  accounts[idx] = {
    ...accounts[idx],
    storeName: storeName.trim().slice(0, 100) || accounts[idx].storeName,
  };
  writeLocalStorage(LS_ACCOUNTS_KEY, accounts);
  return accounts[idx];
}

export async function saveLocalAccountOperator(
  accountId: string,
  op: SaveOperatorInput,
): Promise<StoreOperator[]> {
  const accounts = getLocalAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) return [];

  const existingOps = [...accounts[idx].operators];
  const existing = existingOps.find((o) => o.id === op.id);

  let pinHash = op.existingPinHash ?? existing?.pinHash;
  let legacyPin = op.existingLegacyPin ?? existing?.pin;

  if (op.newPin && isValidPinFormat(op.newPin)) {
    pinHash = await hashPin(accountId, op.id, op.newPin);
    legacyPin = undefined;
  } else if (!pinHash && !legacyPin) {
    pinHash = await hashPin(accountId, op.id, DEFAULT_MANAGER_PIN);
  }

  const role: UserRole = op.role === 'manager' ? 'manager' : 'operator';

  const nextOp: StoreOperator = {
    id: op.id,
    storeId: accountId,
    ownerId: accountId,
    name: op.name.trim().slice(0, 60) || 'Operador',
    code: op.code.trim().slice(0, 20) || 'Op.',
    role,
    ...(pinHash ? { pinHash } : {}),
    ...(!pinHash && legacyPin ? { pin: legacyPin } : {}),
    canConsultPrices: role === 'manager' ? true : Boolean(op.canConsultPrices),
    canAdjustStock: role === 'manager' ? true : Boolean(op.canAdjustStock),
    canManageProducts: role === 'manager' ? true : Boolean(op.canManageProducts),
    active: Boolean(op.active),
  };

  const opIdx = existingOps.findIndex((o) => o.id === nextOp.id);
  if (opIdx >= 0) {
    existingOps[opIdx] = nextOp;
  } else {
    existingOps.push(nextOp);
  }
  existingOps.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'manager' ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
  accounts[idx] = { ...accounts[idx], operators: existingOps };
  writeLocalStorage(LS_ACCOUNTS_KEY, accounts);
  return existingOps;
}

export function deleteLocalAccountOperator(
  accountId: string,
  operatorId: string,
): StoreOperator[] {
  if (operatorId === 'op-01') return getLocalAccounts().find((a) => a.id === accountId)?.operators || [];
  const accounts = getLocalAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx < 0) return [];

  const nextOps = accounts[idx].operators.filter((o) => o.id !== operatorId);
  accounts[idx] = { ...accounts[idx], operators: nextOps };
  writeLocalStorage(LS_ACCOUNTS_KEY, accounts);
  return nextOps;
}

// --- Tenant-Isolated Local Products & Scan Logs ---

function productRecordId(accountId: string, barcode: string): string {
  return `${accountId}::${barcode.trim()}`;
}

function normalizeLocalProduct(product: Product): Product {
  const unit = normalizeStockUnit(product.unit);
  return {
    ...product,
    unit,
    stock: clampStockByUnit(Number(product.stock) || 0, unit),
  };
}

export async function getAllProducts(accountId: string): Promise<Product[]> {
  if (!accountId) return [];
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    return readLocalStorage<Product[]>(`${LS_PRODUCTS_PREFIX}${accountId}`, [])
      .map(normalizeLocalProduct)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const idx = tx.objectStore(STORE_PRODUCTS).index('by_account');
    const req = idx.getAll(IDBKeyRange.only(accountId));
    req.onsuccess = () => {
      const items = ((req.result as StoredProductRecord[]) || []).map(
        ({ id: _id, accountId: _acc, ...product }) => normalizeLocalProduct(product),
      );
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(items);
    };
    req.onerror = () => resolve([]);
  });
}

export async function findProductByBarcode(
  accountId: string,
  barcode: string,
): Promise<Product | null> {
  const normalized = barcode.trim();
  if (!accountId || !normalized) return null;
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    const items = readLocalStorage<Product[]>(`${LS_PRODUCTS_PREFIX}${accountId}`, []);
    const found = items.find((p) => p.barcode === normalized);
    return found ? normalizeLocalProduct(found) : null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const req = tx.objectStore(STORE_PRODUCTS).get(productRecordId(accountId, normalized));
    req.onsuccess = () => {
      const res = req.result as StoredProductRecord | undefined;
      if (!res) {
        resolve(null);
        return;
      }
      const { id: _id, accountId: _acc, ...product } = res;
      resolve(normalizeLocalProduct(product));
    };
    req.onerror = () => resolve(null);
  });
}

export async function upsertProduct(
  accountId: string,
  product: Omit<Product, 'updatedAt'>,
): Promise<Product> {
  await initDatabase();
  const unit = normalizeStockUnit(product.unit);
  const fullProduct: Product = {
    ...product,
    barcode: product.barcode.trim(),
    unit,
    stock: clampStockByUnit(Number(product.stock) || 0, unit),
    updatedAt: new Date().toISOString(),
  };

  const db = await openIDB();
  if (!db) {
    const key = `${LS_PRODUCTS_PREFIX}${accountId}`;
    const items = readLocalStorage<Product[]>(key, []);
    const idx = items.findIndex((p) => p.barcode === fullProduct.barcode);
    if (idx >= 0) {
      items[idx] = fullProduct;
    } else {
      items.unshift(fullProduct);
    }
    writeLocalStorage(key, items);
    return fullProduct;
  }

  const record: StoredProductRecord = {
    ...fullProduct,
    id: productRecordId(accountId, fullProduct.barcode),
    accountId,
  };

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    tx.objectStore(STORE_PRODUCTS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  return fullProduct;
}

export async function deleteProduct(accountId: string, barcode: string): Promise<void> {
  if (!accountId) return;
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    const key = `${LS_PRODUCTS_PREFIX}${accountId}`;
    const items = readLocalStorage<Product[]>(key, []);
    writeLocalStorage(
      key,
      items.filter((p) => p.barcode !== barcode),
    );
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    tx.objectStore(STORE_PRODUCTS).delete(productRecordId(accountId, barcode));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function adjustProductStock(
  accountId: string,
  barcode: string,
  delta: number,
  operatorCode?: string,
): Promise<Product | null> {
  const existing = await findProductByBarcode(accountId, barcode);
  if (!existing) return null;
  const unit = normalizeStockUnit(existing.unit);
  const nextStock = clampStockByUnit(existing.stock + delta, unit);
  return upsertProduct(accountId, {
    ...existing,
    unit,
    stock: nextStock,
    operator: operatorCode || existing.operator,
  });
}

export async function setProductStock(
  accountId: string,
  barcode: string,
  exactStock: number,
  operatorCode?: string,
): Promise<Product | null> {
  const existing = await findProductByBarcode(accountId, barcode);
  if (!existing) return null;
  const unit = normalizeStockUnit(existing.unit);
  const nextStock = clampStockByUnit(exactStock, unit);
  return upsertProduct(accountId, {
    ...existing,
    unit,
    stock: nextStock,
    operator: operatorCode || existing.operator,
  });
}

export async function getCachedBarcodeLookup(
  barcode: string,
): Promise<BarcodeLookupResult | null> {
  const clean = barcode.trim();
  if (!clean) return null;
  const maxAgeMs = 1000 * 60 * 60 * 24 * 30; // 30 dias

  const db = await openIDB();
  if (db && db.objectStoreNames.contains(STORE_BARCODE_CACHE)) {
    const entry = await new Promise<StoredBarcodeCacheEntry | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_BARCODE_CACHE, 'readonly');
        const req = tx.objectStore(STORE_BARCODE_CACHE).get(clean);
        req.onsuccess = () => resolve((req.result as StoredBarcodeCacheEntry) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (entry && Date.now() - entry.cachedAt < maxAgeMs && entry.result) {
      return entry.result;
    }
  }

  const map = readLocalStorage<Record<string, StoredBarcodeCacheEntry>>(LS_BARCODE_CACHE_KEY, {});
  const lsEntry = map[clean];
  if (lsEntry && Date.now() - lsEntry.cachedAt < maxAgeMs && lsEntry.result) {
    return lsEntry.result;
  }
  return null;
}

export async function saveCachedBarcodeLookup(
  barcode: string,
  result: BarcodeLookupResult,
): Promise<void> {
  const clean = barcode.trim();
  if (!clean) return;
  const entry: StoredBarcodeCacheEntry = {
    barcode: clean,
    result,
    cachedAt: Date.now(),
  };

  const db = await openIDB();
  if (db && db.objectStoreNames.contains(STORE_BARCODE_CACHE)) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_BARCODE_CACHE, 'readwrite');
        tx.objectStore(STORE_BARCODE_CACHE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }

  const map = readLocalStorage<Record<string, StoredBarcodeCacheEntry>>(LS_BARCODE_CACHE_KEY, {});
  map[clean] = entry;
  // Limita armazenamento em localStorage caso IndexedDB não esteja disponível
  const keys = Object.keys(map);
  if (keys.length > 150) {
    keys
      .sort((a, b) => map[a].cachedAt - map[b].cachedAt)
      .slice(0, keys.length - 150)
      .forEach((k) => {
        delete map[k];
      });
  }
  writeLocalStorage(LS_BARCODE_CACHE_KEY, map);
}

export async function getScanLogs(accountId: string, limit = 50): Promise<ScanLog[]> {
  if (!accountId) return [];
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    return readLocalStorage<ScanLog[]>(`${LS_LOGS_PREFIX}${accountId}`, [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_LOGS, 'readonly');
    const idx = tx.objectStore(STORE_LOGS).index('by_account');
    const req = idx.getAll(IDBKeyRange.only(accountId));
    req.onsuccess = () => {
      const logs = ((req.result as StoredScanLogRecord[]) || []).map(
        ({ accountId: _acc, ...log }) => log,
      );
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(logs.slice(0, limit));
    };
    req.onerror = () => resolve([]);
  });
}

export async function addScanLog(
  accountId: string,
  entry: Omit<ScanLog, 'id' | 'timestamp'>,
): Promise<ScanLog> {
  await initDatabase();
  const log: ScanLog = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  const db = await openIDB();
  if (!db) {
    const key = `${LS_LOGS_PREFIX}${accountId}`;
    const logs = readLocalStorage<ScanLog[]>(key, []);
    logs.unshift(log);
    writeLocalStorage(key, logs.slice(0, 200));
    return log;
  }

  const record: StoredScanLogRecord = {
    ...log,
    accountId,
  };

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_LOGS, 'readwrite');
    tx.objectStore(STORE_LOGS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  return log;
}

export async function getTodayScanCount(accountId: string): Promise<number> {
  const logs = await getScanLogs(accountId, 250);
  const now = new Date();
  return logs.filter((l) => {
    const d = new Date(l.timestamp);
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  }).length;
}
