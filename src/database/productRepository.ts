import { Product, ScanLog } from '../types/product';

const DB_NAME = 'prontopreco_offline_db';
const DB_VERSION = 1;
const STORE_PRODUCTS = 'products';
const STORE_LOGS = 'scan_logs';
const LS_PRODUCTS_KEY = 'prontopreco_products_v1';
const LS_LOGS_KEY = 'prontopreco_logs_v1';

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const SEED_PRODUCTS: Product[] = [
  {
    barcode: '7891000100103',
    name: 'Café Torrado e Moído Tradicional Pilão 500g',
    brand: 'Pilão',
    category: 'Mercearia',
    price: 19.8,
    wholesalePrice: 18.9,
    clubPrice: 17.99,
    marginPercent: 31.4,
    stock: 24,
    location: 'Prateleira A-04',
    weightLabel: '500g',
    description: 'Embalagem a vácuo tradicional',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(45),
  },
  {
    barcode: '7891000100102',
    name: 'Café Torrado Tradicional 500g',
    brand: 'Melitta',
    category: 'Mercearia',
    price: 18.9,
    wholesalePrice: 17.8,
    clubPrice: 16.99,
    marginPercent: 28.5,
    stock: 18,
    location: 'Prateleira A-04',
    weightLabel: '500g',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(120),
  },
  {
    barcode: '7892000200204',
    name: 'Arroz Nobre Tipo 1 - 5kg',
    brand: 'Tio João',
    category: 'Mercearia',
    price: 28.5,
    wholesalePrice: 26.9,
    clubPrice: 25.9,
    marginPercent: 22.0,
    stock: 42,
    location: 'Corredor 02 · Base',
    weightLabel: '5kg',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(180),
  },
  {
    barcode: '7893000300306',
    name: 'Óleo de Soja Refinado 900ml',
    brand: 'Soya',
    category: 'Mercearia',
    price: 6.8,
    wholesalePrice: 6.45,
    clubPrice: 6.19,
    marginPercent: 19.2,
    stock: 64,
    location: 'Corredor 02 · Prat. C',
    weightLabel: '900ml',
    operator: 'Op. 02',
    updatedAt: minutesAgoIso(240),
  },
  {
    barcode: '7891000053508',
    name: 'Biscoito Maizena Tradicional 400g',
    brand: 'Marilan',
    category: 'Mercearia',
    price: 5.49,
    wholesalePrice: 4.99,
    clubPrice: 4.79,
    marginPercent: 34.0,
    stock: 37,
    location: 'Gôndola 03 · Prat. B',
    weightLabel: '400g',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(90),
  },
  {
    barcode: '7891000315507',
    name: 'Leite Integral Longa Vida UHT 1L',
    brand: 'Italac',
    category: 'Bebidas',
    price: 4.99,
    wholesalePrice: 4.69,
    clubPrice: 4.49,
    marginPercent: 18.5,
    stock: 96,
    location: 'Ilha Lácteos 01',
    weightLabel: '1L',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(150),
  },
  {
    barcode: '7894900011517',
    name: 'Refrigerante Cola Original 2L',
    brand: 'Coca-Cola',
    category: 'Bebidas',
    price: 9.49,
    wholesalePrice: 8.9,
    clubPrice: 8.49,
    marginPercent: 27.8,
    stock: 54,
    location: 'Bebidas · Prat. A-01',
    weightLabel: '2L',
    operator: 'Op. 02',
    updatedAt: minutesAgoIso(300),
  },
  {
    barcode: '7891150021006',
    name: 'Detergente Líquido Neutro 500ml',
    brand: 'Ypê',
    category: 'Limpeza',
    price: 2.69,
    wholesalePrice: 2.39,
    clubPrice: 2.29,
    marginPercent: 36.2,
    stock: 82,
    location: 'Corredor 05 · Limpeza',
    weightLabel: '500ml',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(410),
  },
  {
    barcode: '7891021001234',
    name: 'Sabão em Pó Concentrado 1,6kg',
    brand: 'Omo',
    category: 'Limpeza',
    price: 21.9,
    wholesalePrice: 19.9,
    clubPrice: 18.99,
    marginPercent: 29.0,
    stock: 19,
    location: 'Corredor 05 · Base',
    weightLabel: '1,6kg',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(520),
  },
  {
    barcode: '7891095154005',
    name: 'Queijo Mussarela Fatiado Bandeja 300g',
    brand: 'Sadia',
    category: 'Frios',
    price: 16.5,
    wholesalePrice: 15.2,
    clubPrice: 14.9,
    marginPercent: 33.5,
    stock: 14,
    location: 'Expositor Frios 02',
    weightLabel: '300g',
    operator: 'Op. 02',
    updatedAt: minutesAgoIso(75),
  },
  {
    barcode: '7896004400112',
    name: 'Pão de Forma Tradicional Pacote 500g',
    brand: 'Pullman',
    category: 'Padaria',
    price: 8.79,
    wholesalePrice: 8.1,
    clubPrice: 7.79,
    marginPercent: 30.0,
    stock: 22,
    location: 'Padaria · Gôndola 01',
    weightLabel: '500g',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(200),
  },
  {
    barcode: '7891910000197',
    name: 'Açúcar Refinado Especial 1kg',
    brand: 'União',
    category: 'Mercearia',
    price: 4.69,
    wholesalePrice: 4.35,
    clubPrice: 4.19,
    marginPercent: 21.4,
    stock: 48,
    location: 'Prateleira A-06',
    weightLabel: '1kg',
    operator: 'Op. 01',
    updatedAt: minutesAgoIso(600),
  },
];

export const SEED_LOGS: ScanLog[] = [
  {
    id: 'seed-log-1',
    barcode: '7891000100102',
    productName: 'Café Torrado Tradicional 500g',
    price: 18.9,
    action: 'consulta',
    timestamp: minutesAgoIso(3),
  },
  {
    id: 'seed-log-2',
    barcode: '7892000200204',
    productName: 'Arroz Nobre Tipo 1 - 5kg',
    price: 28.5,
    action: 'consulta',
    timestamp: minutesAgoIso(12),
  },
  {
    id: 'seed-log-3',
    barcode: '7893000300306',
    productName: 'Óleo de Soja Refinado 900ml',
    price: 6.8,
    action: 'consulta',
    timestamp: minutesAgoIso(24),
  },
];

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
          if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
            db.createObjectStore(STORE_PRODUCTS, { keyPath: 'barcode' });
          }
          if (!db.objectStoreNames.contains(STORE_LOGS)) {
            db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
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

export async function initDatabase(): Promise<void> {
  const db = await openIDB();
  if (!db) {
    const existing = readLocalStorage<Product[] | null>(LS_PRODUCTS_KEY, null);
    if (!existing) {
      writeLocalStorage(LS_PRODUCTS_KEY, SEED_PRODUCTS);
      writeLocalStorage(LS_LOGS_KEY, SEED_LOGS);
    }
    return;
  }

  const count = await new Promise<number>((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const store = tx.objectStore(STORE_PRODUCTS);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });

  if (count === 0) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_PRODUCTS, STORE_LOGS], 'readwrite');
      const productStore = tx.objectStore(STORE_PRODUCTS);
      const logStore = tx.objectStore(STORE_LOGS);
      SEED_PRODUCTS.forEach((p) => productStore.put(p));
      SEED_LOGS.forEach((l) => logStore.put(l));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export async function getAllProducts(): Promise<Product[]> {
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    return readLocalStorage<Product[]>(LS_PRODUCTS_KEY, SEED_PRODUCTS).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const req = tx.objectStore(STORE_PRODUCTS).getAll();
    req.onsuccess = () => {
      const items = (req.result as Product[]) || [];
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(items);
    };
    req.onerror = () => resolve(SEED_PRODUCTS);
  });
}

export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    const items = readLocalStorage<Product[]>(LS_PRODUCTS_KEY, SEED_PRODUCTS);
    return items.find((p) => p.barcode === normalized) || null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readonly');
    const req = tx.objectStore(STORE_PRODUCTS).get(normalized);
    req.onsuccess = () => resolve((req.result as Product | undefined) || null);
    req.onerror = () => resolve(null);
  });
}

export async function searchProducts(query: string): Promise<Product[]> {
  const q = query.trim().toLowerCase();
  const all = await getAllProducts();
  if (!q) return all;
  return all.filter(
    (p) =>
      p.barcode.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q),
  );
}

export async function upsertProduct(product: Omit<Product, 'updatedAt'>): Promise<Product> {
  await initDatabase();
  const fullProduct: Product = {
    ...product,
    updatedAt: new Date().toISOString(),
  };

  const db = await openIDB();
  if (!db) {
    const items = readLocalStorage<Product[]>(LS_PRODUCTS_KEY, SEED_PRODUCTS);
    const idx = items.findIndex((p) => p.barcode === fullProduct.barcode);
    if (idx >= 0) {
      items[idx] = fullProduct;
    } else {
      items.unshift(fullProduct);
    }
    writeLocalStorage(LS_PRODUCTS_KEY, items);
    return fullProduct;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    tx.objectStore(STORE_PRODUCTS).put(fullProduct);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  return fullProduct;
}

export async function deleteProduct(barcode: string): Promise<void> {
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    const items = readLocalStorage<Product[]>(LS_PRODUCTS_KEY, SEED_PRODUCTS);
    writeLocalStorage(
      LS_PRODUCTS_KEY,
      items.filter((p) => p.barcode !== barcode),
    );
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
    tx.objectStore(STORE_PRODUCTS).delete(barcode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function adjustProductStock(barcode: string, delta: number): Promise<Product | null> {
  const existing = await findProductByBarcode(barcode);
  if (!existing) return null;
  const nextStock = Math.max(0, existing.stock + delta);
  return upsertProduct({
    ...existing,
    stock: nextStock,
  });
}

export async function getScanLogs(limit = 50): Promise<ScanLog[]> {
  await initDatabase();
  const db = await openIDB();
  if (!db) {
    return readLocalStorage<ScanLog[]>(LS_LOGS_KEY, SEED_LOGS)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_LOGS, 'readonly');
    const req = tx.objectStore(STORE_LOGS).getAll();
    req.onsuccess = () => {
      const logs = (req.result as ScanLog[]) || [];
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(logs.slice(0, limit));
    };
    req.onerror = () => resolve(SEED_LOGS);
  });
}

export async function addScanLog(
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
    const logs = readLocalStorage<ScanLog[]>(LS_LOGS_KEY, SEED_LOGS);
    logs.unshift(log);
    writeLocalStorage(LS_LOGS_KEY, logs.slice(0, 200));
    return log;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_LOGS, 'readwrite');
    tx.objectStore(STORE_LOGS).put(log);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  return log;
}

export async function getTodayScanCount(): Promise<number> {
  const logs = await getScanLogs(250);
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

export async function resetCatalogToSeed(): Promise<void> {
  const db = await openIDB();
  if (!db) {
    writeLocalStorage(LS_PRODUCTS_KEY, SEED_PRODUCTS);
    writeLocalStorage(LS_LOGS_KEY, SEED_LOGS);
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction([STORE_PRODUCTS, STORE_LOGS], 'readwrite');
    const pStore = tx.objectStore(STORE_PRODUCTS);
    const lStore = tx.objectStore(STORE_LOGS);
    pStore.clear();
    lStore.clear();
    SEED_PRODUCTS.forEach((p) => pStore.put(p));
    SEED_LOGS.forEach((l) => lStore.put(l));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
