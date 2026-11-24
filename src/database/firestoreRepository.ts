import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CATEGORIES,
  Category,
  Product,
  SaveOperatorInput,
  ScanLog,
  StoreInfo,
  StoreOperator,
  UserProfile,
  UserRole,
} from '../types/product';
import {
  DEFAULT_MANAGER_PIN,
  hashPin,
  isValidPinFormat,
} from '../utils/pinSecurity';

function sanitizeId(raw: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return (cleaned || 'item').slice(0, 32);
}

function clampStr(val: string | undefined, max: number, fallback: string): string {
  const s = (val || '').trim();
  if (!s) return fallback.slice(0, max);
  return s.slice(0, max);
}

function clampCategory(cat: string): Category {
  return (CATEGORIES as string[]).includes(cat) ? (cat as Category) : 'Outros';
}

function clampNum(val: number | undefined, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, Number(n.toFixed(2))));
}

function sanitizeImageUrl(url: string | undefined): string {
  const trimmed = (url || '').trim();
  if (!trimmed.startsWith('https://')) return '';
  return trimmed.slice(0, 500);
}

function timestampToIso(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (typeof ts === 'string' && ts) {
    return ts;
  }
  return new Date().toISOString();
}

function normalizeRole(raw: unknown): UserRole {
  return raw === 'manager' || raw === 'admin' ? 'manager' : 'operator';
}

export async function ensureUserAndStore(user: User): Promise<{
  profile: UserProfile;
  store: StoreInfo;
  isNewStore: boolean;
}> {
  const userPath = `users/${user.uid}`;
  let profile: UserProfile;

  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      profile = {
        uid: d.uid,
        displayName: d.displayName,
        email: d.email,
        role: normalizeRole(d.role),
        storeId: d.storeId,
      };
    } else {
      const displayName = clampStr(user.displayName || user.email?.split('@')[0], 80, 'Gerente');
      const email = clampStr(user.email || 'usuario@loja.local', 120, 'usuario@loja.local');
      const storeId = user.uid;

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName,
        email,
        role: 'operator',
        storeId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      profile = {
        uid: user.uid,
        displayName,
        email,
        role: 'manager',
        storeId,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  const storePath = `stores/${profile.storeId}`;
  let store: StoreInfo;
  let isNewStore = false;

  try {
    const storeRef = doc(db, 'stores', profile.storeId);
    const storeSnap = await getDoc(storeRef);
    if (storeSnap.exists()) {
      const sd = storeSnap.data();
      store = {
        storeId: sd.storeId,
        name: sd.name,
        ownerId: sd.ownerId,
      };
    } else {
      isNewStore = true;
      const defaultStoreName = clampStr(
        user.displayName ? `Loja ${user.displayName}` : 'Minha Loja ProntoPreço',
        100,
        'Minha Loja ProntoPreço',
      );
      await setDoc(storeRef, {
        storeId: profile.storeId,
        name: defaultStoreName,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      store = {
        storeId: profile.storeId,
        name: defaultStoreName,
        ownerId: user.uid,
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, storePath);
  }

  // Provision ONLY the store creator's Gerente profile (op-01) if none exist yet; zero dummy operators
  const opsPath = `stores/${store.storeId}/operators`;
  try {
    const opsSnap = await getDocs(
      query(collection(db, opsPath), where('ownerId', '==', user.uid), limit(1)),
    );
    if (opsSnap.empty) {
      const op1Ref = doc(db, opsPath, 'op-01');
      const defaultPinHash = await hashPin(store.storeId, 'op-01', DEFAULT_MANAGER_PIN);
      await setDoc(op1Ref, {
        id: 'op-01',
        storeId: store.storeId,
        ownerId: user.uid,
        name: clampStr(user.displayName || user.email?.split('@')[0] || 'Gerente Principal', 60, 'Gerente'),
        code: 'Op. 01',
        role: 'manager',
        pinHash: defaultPinHash,
        canConsultPrices: true,
        canAdjustStock: true,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, opsPath);
  }

  return { profile, store, isNewStore };
}

export function subscribeStoreProducts(
  storeId: string,
  ownerId: string,
  onData: (products: Product[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  const path = `stores/${storeId}/products`;
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Product[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          barcode: data.barcode,
          name: data.name,
          brand: data.brand,
          category: clampCategory(data.category),
          price: Number(data.price),
          wholesalePrice: Number(data.wholesalePrice),
          clubPrice: Number(data.clubPrice),
          marginPercent: Number(data.marginPercent),
          stock: Number(data.stock),
          location: data.location,
          weightLabel: data.weightLabel,
          description: data.description || '',
          imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
          operator: data.operator || 'Op. 01',
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      items.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      onData(items);
    },
    (error) => {
      onError(error);
    },
  );
}

export function subscribeStoreScanLogs(
  storeId: string,
  ownerId: string,
  onData: (logs: ScanLog[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  const path = `stores/${storeId}/scans`;
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ScanLog[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id,
          barcode: data.barcode,
          productName: data.productName,
          price: Number(data.price),
          action: data.action,
          operator: data.operator,
          timestamp: timestampToIso(data.timestamp),
        };
      });
      items.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      onData(items.slice(0, 80));
    },
    (error) => {
      onError(error);
    },
  );
}

export function subscribeStoreOperators(
  storeId: string,
  ownerId: string,
  onData: (operators: StoreOperator[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  const path = `stores/${storeId}/operators`;
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: StoreOperator[] = snapshot.docs.map((d) => {
        const data = d.data();
        const role = normalizeRole(data.role);
        return {
          id: data.id,
          storeId: data.storeId,
          ownerId: data.ownerId,
          name: data.name,
          code: data.code,
          role,
          pinHash: typeof data.pinHash === 'string' ? data.pinHash : undefined,
          pin: typeof data.pin === 'string' ? data.pin : undefined,
          canConsultPrices: role === 'manager' ? true : data.canConsultPrices !== false,
          canAdjustStock: role === 'manager' ? true : data.canAdjustStock !== false,
          active: Boolean(data.active),
        };
      });
      items.sort((a, b) => {
        if (a.role !== b.role) return a.role === 'manager' ? -1 : 1;
        return a.code.localeCompare(b.code);
      });
      onData(items);
    },
    (error) => {
      onError(error);
    },
  );
}

export async function saveProductToFirestore(
  storeId: string,
  ownerId: string,
  uid: string,
  product: Omit<Product, 'updatedAt'>,
): Promise<Product> {
  const barcode = sanitizeId(product.barcode);
  const path = `stores/${storeId}/products/${barcode}`;
  const ref = doc(db, 'stores', storeId, 'products', barcode);

  const sanitized = {
    name: clampStr(product.name, 120, 'Produto'),
    brand: clampStr(product.brand, 60, 'Marca Própria'),
    category: clampCategory(product.category),
    price: clampNum(product.price, 0.01, 1000000, 1),
    wholesalePrice: clampNum(product.wholesalePrice, 0, 1000000, product.price * 0.94),
    clubPrice: clampNum(product.clubPrice, 0, 1000000, product.price * 0.9),
    marginPercent: clampNum(product.marginPercent, 0, 100, 28),
    stock: clampNum(product.stock, 0, 1000000, 0),
    location: clampStr(product.location, 80, 'Balcão'),
    weightLabel: clampStr(product.weightLabel, 24, 'un'),
    description: (product.description || '').trim().slice(0, 240),
    imageUrl: sanitizeImageUrl(product.imageUrl),
    operator: clampStr(product.operator, 32, 'Op. 01'),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, sanitized);
    } else {
      await setDoc(ref, {
        barcode,
        storeId,
        ownerId,
        ...sanitized,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }

  return {
    ...product,
    barcode,
    name: sanitized.name,
    brand: sanitized.brand,
    category: sanitized.category,
    price: sanitized.price,
    wholesalePrice: sanitized.wholesalePrice,
    clubPrice: sanitized.clubPrice,
    marginPercent: sanitized.marginPercent,
    stock: sanitized.stock,
    location: sanitized.location,
    weightLabel: sanitized.weightLabel,
    description: sanitized.description,
    imageUrl: sanitized.imageUrl || undefined,
    operator: sanitized.operator,
    updatedAt: new Date().toISOString(),
  };
}

export async function adjustStockInFirestore(
  storeId: string,
  barcode: string,
  nextStock: number,
  operatorCode: string,
  uid: string,
): Promise<void> {
  const cleanBarcode = sanitizeId(barcode);
  const path = `stores/${storeId}/products/${cleanBarcode}`;
  try {
    await updateDoc(doc(db, 'stores', storeId, 'products', cleanBarcode), {
      stock: clampNum(nextStock, 0, 1000000, 0),
      operator: clampStr(operatorCode, 32, 'Op. 01'),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteProductInFirestore(
  storeId: string,
  barcode: string,
): Promise<void> {
  const cleanBarcode = sanitizeId(barcode);
  const path = `stores/${storeId}/products/${cleanBarcode}`;
  try {
    await deleteDoc(doc(db, 'stores', storeId, 'products', cleanBarcode));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addScanLogToFirestore(
  storeId: string,
  ownerId: string,
  uid: string,
  entry: Omit<ScanLog, 'id' | 'timestamp'>,
): Promise<void> {
  const logId = sanitizeId(`log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const path = `stores/${storeId}/scans/${logId}`;
  try {
    await setDoc(doc(db, 'stores', storeId, 'scans', logId), {
      id: logId,
      storeId,
      ownerId,
      barcode: sanitizeId(entry.barcode),
      productName: clampStr(entry.productName, 120, 'Produto'),
      price: clampNum(entry.price, 0, 1000000, 0),
      action: entry.action,
      operator: clampStr(entry.operator, 32, 'Op. 01'),
      userId: uid,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function saveOperatorToFirestore(
  storeId: string,
  ownerId: string,
  op: SaveOperatorInput,
): Promise<void> {
  const opId = sanitizeId(op.id);
  const path = `stores/${storeId}/operators/${opId}`;
  const ref = doc(db, 'stores', storeId, 'operators', opId);
  const role: UserRole = op.role === 'manager' ? 'manager' : 'operator';

  let pinHash = op.existingPinHash;
  if (op.newPin && isValidPinFormat(op.newPin)) {
    pinHash = await hashPin(storeId, opId, op.newPin);
  } else if (!pinHash && !op.existingLegacyPin) {
    pinHash = await hashPin(storeId, opId, DEFAULT_MANAGER_PIN);
  }

  const basePayload = {
    name: clampStr(op.name, 60, role === 'manager' ? 'Gerente' : 'Operador'),
    code: clampStr(op.code, 20, 'Op.'),
    role,
    canConsultPrices: role === 'manager' ? true : Boolean(op.canConsultPrices),
    canAdjustStock: role === 'manager' ? true : Boolean(op.canAdjustStock),
    active: Boolean(op.active),
    updatedAt: serverTimestamp(),
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      const updatePayload: Record<string, unknown> = {
        ...basePayload,
      };
      if (pinHash) {
        updatePayload.pinHash = pinHash;
        if (existingSnap.data()?.pin !== undefined) {
          updatePayload.pin = deleteField();
        }
      } else if (op.existingLegacyPin) {
        updatePayload.pin = op.existingLegacyPin;
      }
      await updateDoc(ref, updatePayload);
    } else {
      await setDoc(ref, {
        id: opId,
        storeId,
        ownerId,
        ...basePayload,
        ...(pinHash ? { pinHash } : { pin: op.existingLegacyPin || DEFAULT_MANAGER_PIN }),
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteOperatorInFirestore(
  storeId: string,
  operatorId: string,
): Promise<void> {
  if (operatorId === 'op-01') return;
  const opId = sanitizeId(operatorId);
  const path = `stores/${storeId}/operators/${opId}`;
  try {
    await deleteDoc(doc(db, 'stores', storeId, 'operators', opId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateStoreNameInFirestore(
  storeId: string,
  name: string,
): Promise<void> {
  const path = `stores/${storeId}`;
  try {
    await updateDoc(doc(db, 'stores', storeId), {
      name: clampStr(name, 100, 'Minha Loja ProntoPreço'),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncLocalProductsToCloud(
  storeId: string,
  ownerId: string,
  uid: string,
  localProducts: Product[],
): Promise<number> {
  const batch = writeBatch(db);
  let count = 0;

  for (const item of localProducts.slice(0, 100)) {
    const barcode = sanitizeId(item.barcode);
    const ref = doc(db, 'stores', storeId, 'products', barcode);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      batch.set(ref, {
        barcode,
        storeId,
        ownerId,
        name: clampStr(item.name, 120, 'Produto'),
        brand: clampStr(item.brand, 60, 'Marca Própria'),
        category: clampCategory(item.category),
        price: clampNum(item.price, 0.01, 1000000, 1),
        wholesalePrice: clampNum(item.wholesalePrice, 0, 1000000, item.price * 0.94),
        clubPrice: clampNum(item.clubPrice, 0, 1000000, item.price * 0.9),
        marginPercent: clampNum(item.marginPercent, 0, 100, 28),
        stock: clampNum(item.stock, 0, 1000000, 0),
        location: clampStr(item.location, 80, 'Balcão'),
        weightLabel: clampStr(item.weightLabel, 24, 'un'),
        description: (item.description || '').trim().slice(0, 240),
        imageUrl: sanitizeImageUrl(item.imageUrl),
        operator: clampStr(item.operator, 32, 'Op. 01'),
        updatedBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      count += 1;
    }
  }

  if (count > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `stores/${storeId}/products`);
    }
  }

  return count;
}
