import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import {
  AppView,
  LocalAccount,
  Product,
  SaveOperatorInput,
  ScanLog,
  ScannerMode,
  StoreInfo,
  StoreOperator,
  UpdateCheckResult,
} from './types/product';
import {
  addScanLog,
  adjustProductStock,
  createLocalAccount,
  deleteLocalAccountOperator,
  deleteProduct,
  getActiveLocalAccountId,
  getAllProducts,
  getLocalAccounts,
  getScanLogs,
  getTodayScanCount,
  initDatabase,
  saveLocalAccountOperator,
  setActiveLocalAccountId,
  updateLocalAccountStoreName,
  upsertProduct,
} from './database/productRepository';
import {
  auth,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';
import {
  addScanLogToFirestore,
  adjustStockInFirestore,
  deleteOperatorInFirestore,
  deleteProductInFirestore,
  ensureUserAndStore,
  saveOperatorToFirestore,
  saveProductToFirestore,
  subscribeStoreOperators,
  subscribeStoreProducts,
  subscribeStoreScanLogs,
  syncLocalProductsToCloud,
  updateStoreNameInFirestore,
} from './database/firestoreRepository';
import { checkForGitHubUpdate } from './services/githubUpdateService';
import { useBarcodeKeyboardScanner } from './hooks/useBarcodeKeyboardScanner';
import { playBeep, triggerHaptic } from './utils/feedback';
import {
  clearUnlockedOperatorSession,
  getCredentialSignature,
  readUnlockedOperatorSession,
  saveUnlockedOperatorSession,
  UnlockedOperatorSession,
} from './utils/pinSecurity';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { AccountModal } from './components/AccountModal';
import { ProfileLockScreen } from './components/ProfileLockScreen';
import { UpdateBannerModal } from './components/UpdateBannerModal';
import { HomeScreen } from './screens/HomeScreen';
import { ScannerScreen } from './screens/ScannerScreen';
import { ProductDetailsScreen } from './screens/ProductDetailsScreen';
import { ProductFormScreen } from './screens/ProductFormScreen';
import { HistoryCatalogScreen } from './screens/HistoryCatalogScreen';

export default function App() {
  const [fatalError, setFatalError] = useState<Error | null>(null);

  const [localReady, setLocalReady] = useState(false);
  const [localAccounts, setLocalAccounts] = useState<LocalAccount[]>([]);
  const [activeLocalAccountId, setActiveLocalAccountIdState] = useState<string | null>(null);
  const [localAccountProductCounts, setLocalAccountProductCounts] = useState<
    Record<string, number>
  >({});
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [localLogs, setLocalLogs] = useState<ScanLog[]>([]);
  const [localTodayScans, setLocalTodayScans] = useState(0);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authCheckNonce, setAuthCheckNonce] = useState(0);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [cloudProducts, setCloudProducts] = useState<Product[]>([]);
  const [cloudLogs, setCloudLogs] = useState<ScanLog[]>([]);
  const [cloudOperators, setCloudOperators] = useState<StoreOperator[]>([]);
  const [cloudOperatorsReady, setCloudOperatorsReady] = useState(false);
  const [cloudBooting, setCloudBooting] = useState(false);

  const autoUnlockNewStoreIdRef = useRef<string | null>(null);
  const [unlockedSession, setUnlockedSession] =
    useState<UnlockedOperatorSession | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);

  const [view, setView] = useState<AppView>('home');
  const [returnView, setReturnView] = useState<AppView>('home');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('query');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [formBarcode, setFormBarcode] = useState<string>('');
  const [formLockBarcode, setFormLockBarcode] = useState<boolean>(false);

  if (fatalError) {
    throw fatalError;
  }

  const runUpdateCheck = useCallback(async (force = false): Promise<UpdateCheckResult> => {
    setCheckingUpdates(true);
    if (force) {
      setDismissedUpdateVersion(null);
    }
    try {
      const result = await checkForGitHubUpdate(force);
      setUpdateInfo(result);
      return result;
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  // Background non-blocking GitHub update check on startup
  useEffect(() => {
    const timer = setTimeout(() => {
      void runUpdateCheck(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [runUpdateCheck]);

  const refreshLocalAccountsAndCounts = useCallback(async () => {
    const accounts = getLocalAccounts();
    setLocalAccounts(accounts);
    const counts: Record<string, number> = {};
    await Promise.all(
      accounts.map(async (acc) => {
        const items = await getAllProducts(acc.id);
        counts[acc.id] = items.length;
      }),
    );
    setLocalAccountProductCounts(counts);
    return accounts;
  }, []);

  const refreshLocalStoreData = useCallback(
    async (accountId: string | null) => {
      if (!accountId) {
        setLocalProducts([]);
        setLocalLogs([]);
        setLocalTodayScans(0);
        return;
      }
      const [allProds, recentLogs, countToday] = await Promise.all([
        getAllProducts(accountId),
        getScanLogs(accountId, 50),
        getTodayScanCount(accountId),
      ]);
      setLocalProducts(allProds);
      setLocalLogs(recentLogs);
      setLocalTodayScans(countToday);
      setLocalAccountProductCounts((prev) => ({
        ...prev,
        [accountId]: allProds.length,
      }));
    },
    [],
  );

  // Boot local IndexedDB + restore last active Local Store if present
  useEffect(() => {
    let mounted = true;
    async function boot() {
      void testConnection();
      await initDatabase();
      if (!mounted) return;
      const accounts = await refreshLocalAccountsAndCounts();
      const savedLocalId = getActiveLocalAccountId();
      const validSaved =
        savedLocalId && accounts.some((a) => a.id === savedLocalId)
          ? savedLocalId
          : null;
      if (mounted) {
        setActiveLocalAccountIdState(validSaved);
        if (validSaved) {
          setUnlockedSession(readUnlockedOperatorSession(validSaved));
        }
        await refreshLocalStoreData(validSaved);
        setLocalReady(true);
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, [refreshLocalAccountsAndCounts, refreshLocalStoreData]);

  // Listen to Firebase Auth & mount Firestore listeners ONLY when verified
  useEffect(() => {
    let active = true;
    let unsubProducts: Unsubscribe | null = null;
    let unsubLogs: Unsubscribe | null = null;
    let unsubOperators: Unsubscribe | null = null;

    const cleanupSubs = () => {
      unsubProducts?.();
      unsubLogs?.();
      unsubOperators?.();
      unsubProducts = null;
      unsubLogs = null;
      unsubOperators = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      cleanupSubs();
      if (!active) return;

      setAuthUser(user);

      if (!user || !user.emailVerified) {
        setStoreInfo(null);
        setCloudProducts([]);
        setCloudLogs([]);
        setCloudOperators([]);
        setCloudOperatorsReady(false);
        setCloudBooting(false);
        setAuthReady(true);
        return;
      }

      setCloudBooting(true);
      setCloudOperatorsReady(false);
      try {
        const { store, isNewStore } = await ensureUserAndStore(user);
        if (!active) return;
        setStoreInfo(store);
        setActiveProduct(null);
        setView('home');

        if (isNewStore) {
          // Brand-new store creator starts immediately authenticated as Gerente
          autoUnlockNewStoreIdRef.current = store.storeId;
        } else {
          autoUnlockNewStoreIdRef.current = null;
          setUnlockedSession(readUnlockedOperatorSession(store.storeId));
        }

        const reportSnapshotError = (path: string) => (err: unknown) => {
          try {
            handleFirestoreError(err, OperationType.LIST, path);
          } catch (wrapped) {
            setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        };

        unsubProducts = subscribeStoreProducts(
          store.storeId,
          store.ownerId,
          (items) => {
            if (active) setCloudProducts(items);
          },
          reportSnapshotError(`stores/${store.storeId}/products`),
        );

        unsubLogs = subscribeStoreScanLogs(
          store.storeId,
          store.ownerId,
          (items) => {
            if (active) setCloudLogs(items);
          },
          reportSnapshotError(`stores/${store.storeId}/scans`),
        );

        unsubOperators = subscribeStoreOperators(
          store.storeId,
          store.ownerId,
          (items) => {
            if (!active) return;
            setCloudOperators(items);
            setCloudOperatorsReady(true);

            if (autoUnlockNewStoreIdRef.current === store.storeId) {
              const creatorMgr =
                items.find((o) => o.id === 'op-01' && o.active) ||
                items.find((o) => o.role === 'manager' && o.active);
              if (creatorMgr) {
                autoUnlockNewStoreIdRef.current = null;
                saveUnlockedOperatorSession(store.storeId, creatorMgr);
                setUnlockedSession(readUnlockedOperatorSession(store.storeId));
              }
            }
          },
          reportSnapshotError(`stores/${store.storeId}/operators`),
        );
      } catch (err) {
        if (active) {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (active) {
          setCloudBooting(false);
          setAuthReady(true);
        }
      }
    });

    return () => {
      active = false;
      cleanupSubs();
      unsubAuth();
    };
  }, [authCheckNonce]);

  const activeLocalAccount = useMemo(
    () => localAccounts.find((a) => a.id === activeLocalAccountId) || null,
    [localAccounts, activeLocalAccountId],
  );

  const syncMode: 'cloud' | 'local' | 'none' =
    authUser && authUser.emailVerified && storeInfo
      ? 'cloud'
      : !authUser && activeLocalAccount
        ? 'local'
        : 'none';

  const activeStoreId =
    syncMode === 'cloud'
      ? storeInfo?.storeId || ''
      : syncMode === 'local'
        ? activeLocalAccount?.id || ''
        : '';

  // Refresh unlockedSession when switching between cloud & local store IDs
  useEffect(() => {
    if (!activeStoreId) {
      setUnlockedSession(null);
      return;
    }
    setUnlockedSession(readUnlockedOperatorSession(activeStoreId));
  }, [activeStoreId]);

  const operators = useMemo(() => {
    if (syncMode === 'cloud') return cloudOperators;
    if (syncMode === 'local' && activeLocalAccount) return activeLocalAccount.operators;
    return [];
  }, [syncMode, cloudOperators, activeLocalAccount]);

  // STRICT PIN GATE: NEVER auto-fallback to operators[0] or Gerente when unlockedSession is missing/invalid!
  const activeOperator = useMemo<StoreOperator | null>(() => {
    if (syncMode === 'none' || !activeStoreId || operators.length === 0 || !unlockedSession) {
      return null;
    }
    const matched = operators.find(
      (op) => op.id === unlockedSession.operatorId && op.active,
    );
    if (!matched) return null;
    if (getCredentialSignature(matched) !== unlockedSession.credentialSignature) {
      return null;
    }
    return matched;
  }, [syncMode, activeStoreId, operators, unlockedSession]);

  // If remote PIN update / deactivation invalidated activeOperator, lock cleanly
  useEffect(() => {
    if (!activeOperator && accountModalOpen && syncMode !== 'none') {
      setAccountModalOpen(false);
    }
  }, [activeOperator, accountModalOpen, syncMode]);

  const isManager = activeOperator?.role === 'manager';
  const canEditPrices = Boolean(activeOperator && isManager);
  const canConsultPrices = Boolean(
    activeOperator && (isManager || activeOperator.canConsultPrices),
  );
  const canAdjustStock = Boolean(
    activeOperator && (isManager || activeOperator.canAdjustStock),
  );
  const operatorCode = activeOperator?.code || 'Op. 01';

  const products = syncMode === 'cloud' ? cloudProducts : localProducts;
  const logs = syncMode === 'cloud' ? cloudLogs : localLogs;

  // O(1) in-memory cache lookup by barcode for zero-latency reads
  const productByBarcodeMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.barcode.trim(), p);
    }
    return map;
  }, [products]);

  const findProductInstant = useCallback(
    (barcode: string): Product | null => {
      const clean = barcode.trim();
      if (!clean) return null;
      return productByBarcodeMap.get(clean) || null;
    },
    [productByBarcodeMap],
  );

  const todayScans = useMemo(() => {
    if (syncMode === 'local') return localTodayScans;
    const todayKey = new Date().toDateString();
    return cloudLogs.filter(
      (l) => new Date(l.timestamp).toDateString() === todayKey,
    ).length;
  }, [syncMode, localTodayScans, cloudLogs]);

  const currentActiveProduct = useMemo(() => {
    if (!activeProduct) return null;
    return productByBarcodeMap.get(activeProduct.barcode) || activeProduct;
  }, [activeProduct, productByBarcodeMap]);

  const handleSelectOperator = useCallback(
    (op: StoreOperator) => {
      if (!activeStoreId || !op.active) return;
      saveUnlockedOperatorSession(activeStoreId, op);
      setUnlockedSession(readUnlockedOperatorSession(activeStoreId));
      setView('home');
    },
    [activeStoreId],
  );

  const handleLockRegister = useCallback(() => {
    if (activeStoreId) {
      clearUnlockedOperatorSession(activeStoreId);
    }
    setUnlockedSession(null);
    setAccountModalOpen(false);
    setActiveProduct(null);
    setView('home');
    triggerHaptic(25);
  }, [activeStoreId]);

  const handleSelectLocalAccount = async (accountId: string) => {
    // Entering an existing local account always requires selecting profile + PIN
    clearUnlockedOperatorSession(accountId);
    setActiveLocalAccountId(accountId);
    setActiveLocalAccountIdState(accountId);
    setUnlockedSession(null);
    setActiveProduct(null);
    setView('home');
    await refreshLocalStoreData(accountId);
  };

  const handleCreateLocalAccount = async (
    storeName: string,
    managerName: string,
    managerPin: string,
  ) => {
    const acc = await createLocalAccount(storeName, managerName, managerPin);
    await refreshLocalAccountsAndCounts();
    setActiveLocalAccountIdState(acc.id);
    if (acc.operators[0]) {
      // Creator of the new Local Store enters immediately authenticated as Gerente
      saveUnlockedOperatorSession(acc.id, acc.operators[0]);
      setUnlockedSession(readUnlockedOperatorSession(acc.id));
    }
    setActiveProduct(null);
    setView('home');
    await refreshLocalStoreData(acc.id);
  };

  const handleExitLocalAccount = () => {
    if (activeLocalAccountId) {
      clearUnlockedOperatorSession(activeLocalAccountId);
    }
    setActiveLocalAccountId(null);
    setActiveLocalAccountIdState(null);
    setUnlockedSession(null);
    setActiveProduct(null);
    setLocalProducts([]);
    setLocalLogs([]);
    setLocalTodayScans(0);
    setAccountModalOpen(false);
    setView('home');
  };

  const handleSignOutCloud = async () => {
    if (storeInfo?.storeId) {
      clearUnlockedOperatorSession(storeInfo.storeId);
    }
    await signOut(auth);
    setUnlockedSession(null);
    setActiveProduct(null);
    setAccountModalOpen(false);
    setView('home');
  };

  const handleNavigate = (nextView: AppView, mode?: ScannerMode) => {
    if (syncMode === 'none' || !activeOperator) return;
    if (mode) setScannerMode(mode);
    if (nextView === 'scanner' && !canConsultPrices && !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    if (nextView === 'form') {
      if (!canEditPrices) {
        setAccountModalOpen(true);
        return;
      }
      setReturnView(view);
      setActiveProduct(null);
      setFormBarcode('');
      setFormLockBarcode(false);
    }
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleStartScan = (mode: ScannerMode) => {
    if (syncMode === 'none' || !activeOperator) return;
    if (mode === 'query' && !canConsultPrices) {
      setAccountModalOpen(true);
      return;
    }
    if (mode === 'register' && !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    setScannerMode(mode);
    setView('scanner');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const recordScanLog = useCallback(
    async (entry: Omit<ScanLog, 'id' | 'timestamp'>) => {
      if (!activeOperator) return;
      if (syncMode === 'cloud' && authUser && storeInfo) {
        await addScanLogToFirestore(storeInfo.storeId, storeInfo.ownerId, authUser.uid, {
          ...entry,
          operator: operatorCode,
        });
      } else if (syncMode === 'local' && activeLocalAccount) {
        await addScanLog(activeLocalAccount.id, { ...entry, operator: operatorCode });
        await refreshLocalStoreData(activeLocalAccount.id);
      }
    },
    [
      activeOperator,
      syncMode,
      authUser,
      storeInfo,
      activeLocalAccount,
      operatorCode,
      refreshLocalStoreData,
    ],
  );

  const handleOpenProduct = async (product: Product) => {
    if (!activeOperator || !canConsultPrices) {
      setAccountModalOpen(true);
      return;
    }
    await recordScanLog({
      barcode: product.barcode,
      productName: product.name,
      price: product.price,
      action: 'consulta',
    });
    setReturnView(view === 'details' || view === 'form' ? 'home' : view);
    setActiveProduct(product);
    setView('details');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleRegisterBarcode = (barcode: string) => {
    if (!activeOperator || !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    const existing = findProductInstant(barcode);
    setReturnView(view === 'form' ? 'home' : view);
    setActiveProduct(existing);
    setFormBarcode(barcode);
    setFormLockBarcode(Boolean(barcode));
    setView('form');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleScanResolved = useCallback(
    async (barcode: string, mode: ScannerMode) => {
      if (!activeOperator) return;
      const found = findProductInstant(barcode);

      if (mode === 'query') {
        if (!canConsultPrices) {
          setAccountModalOpen(true);
          return;
        }
        if (found) {
          void recordScanLog({
            barcode: found.barcode,
            productName: found.name,
            price: found.price,
            action: 'consulta',
          });
          setReturnView(view === 'details' || view === 'form' ? 'home' : view);
          setActiveProduct(found);
          setView('details');
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
          return;
        }
        if (canEditPrices) {
          setReturnView(view === 'form' ? 'home' : view);
          setActiveProduct(null);
          setFormBarcode(barcode);
          setFormLockBarcode(true);
          setView('form');
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        } else {
          setAccountModalOpen(true);
        }
        return;
      }

      if (!canEditPrices) {
        setAccountModalOpen(true);
        return;
      }

      setReturnView(view === 'form' ? 'home' : view);
      setActiveProduct(found);
      setFormBarcode(barcode);
      setFormLockBarcode(true);
      setView('form');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [activeOperator, findProductInstant, canConsultPrices, recordScanLog, view, canEditPrices],
  );

  // Global USB / Bluetooth keyboard-emulated barcode scanner listener (only when unlocked!)
  useBarcodeKeyboardScanner({
    enabled:
      Boolean(activeOperator) &&
      canConsultPrices &&
      syncMode !== 'none' &&
      !accountModalOpen &&
      view !== 'form',
    onScan: (code) => {
      triggerHaptic(35);
      const found = findProductInstant(code);
      playBeep(found ? 'success' : 'error');
      void handleScanResolved(code, view === 'scanner' ? scannerMode : 'query');
    },
  });

  const handleEditFromDetails = (product: Product) => {
    if (!activeOperator || !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    setReturnView('details');
    setActiveProduct(product);
    setFormBarcode(product.barcode);
    setFormLockBarcode(true);
    setView('form');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  // Defense-in-depth server/action guards even if UI were bypassed
  const handleSaveProduct = async (
    payload: Omit<Product, 'updatedAt'>,
  ): Promise<Product> => {
    if (!activeOperator || !canEditPrices) {
      throw new Error('Operação restrita ao perfil Gerente.');
    }

    const existedBefore = Boolean(findProductInstant(payload.barcode));

    if (syncMode === 'cloud' && authUser && storeInfo) {
      const saved = await saveProductToFirestore(
        storeInfo.storeId,
        storeInfo.ownerId,
        authUser.uid,
        { ...payload, operator: operatorCode },
      );
      await addScanLogToFirestore(storeInfo.storeId, storeInfo.ownerId, authUser.uid, {
        barcode: saved.barcode,
        productName: saved.name,
        price: saved.price,
        action: existedBefore ? 'ajuste' : 'cadastro',
        operator: operatorCode,
      });
      setActiveProduct(saved);
      return saved;
    }

    if (!activeLocalAccount) {
      throw new Error('Nenhuma loja local selecionada.');
    }

    const saved = await upsertProduct(activeLocalAccount.id, {
      ...payload,
      operator: operatorCode,
    });
    await addScanLog(activeLocalAccount.id, {
      barcode: saved.barcode,
      productName: saved.name,
      price: saved.price,
      action: existedBefore ? 'ajuste' : 'cadastro',
      operator: operatorCode,
    });
    await refreshLocalStoreData(activeLocalAccount.id);
    setActiveProduct(saved);
    return saved;
  };

  const handleDeleteProduct = async (barcode: string) => {
    if (!activeOperator || !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    if (syncMode === 'cloud' && storeInfo) {
      await deleteProductInFirestore(storeInfo.storeId, barcode);
    } else if (syncMode === 'local' && activeLocalAccount) {
      await deleteProduct(activeLocalAccount.id, barcode);
      await refreshLocalStoreData(activeLocalAccount.id);
    }
    setActiveProduct(null);
    setView('history');
  };

  const handleAdjustStock = async (barcode: string, delta: number) => {
    if (!activeOperator || !canAdjustStock) {
      setAccountModalOpen(true);
      return;
    }
    const existing = findProductInstant(barcode);
    if (!existing) return;

    if (syncMode === 'cloud' && authUser && storeInfo) {
      const nextStock = Math.max(0, existing.stock + delta);
      await adjustStockInFirestore(
        storeInfo.storeId,
        barcode,
        nextStock,
        operatorCode,
        authUser.uid,
      );
      return;
    }

    if (syncMode === 'local' && activeLocalAccount) {
      const updated = await adjustProductStock(
        activeLocalAccount.id,
        barcode,
        delta,
        operatorCode,
      );
      if (updated) {
        setActiveProduct(updated);
        await refreshLocalStoreData(activeLocalAccount.id);
      }
    }
  };

  const handleSaveOperator = async (op: SaveOperatorInput) => {
    if (!activeOperator || !isManager) {
      throw new Error('Somente o Gerente pode gerenciar operadores e PINs.');
    }

    if (syncMode === 'cloud' && storeInfo) {
      await saveOperatorToFirestore(storeInfo.storeId, storeInfo.ownerId, op);
      // If Manager updated their OWN PIN, immediately refresh local unlock session signature
      if (op.id === activeOperator.id && op.newPin) {
        const updatedSig = await import('./utils/pinSecurity').then((m) =>
          m.hashPin(storeInfo.storeId, op.id, op.newPin!),
        );
        saveUnlockedOperatorSession(storeInfo.storeId, {
          id: op.id,
          pinHash: updatedSig,
        });
        setUnlockedSession(readUnlockedOperatorSession(storeInfo.storeId));
      }
    } else if (syncMode === 'local' && activeLocalAccount) {
      const updatedOps = await saveLocalAccountOperator(activeLocalAccount.id, op);
      setLocalAccounts(getLocalAccounts());
      if (op.id === activeOperator.id) {
        const selfOp = updatedOps.find((o) => o.id === op.id);
        if (selfOp) {
          saveUnlockedOperatorSession(activeLocalAccount.id, selfOp);
          setUnlockedSession(readUnlockedOperatorSession(activeLocalAccount.id));
        }
      }
    }
  };

  const handleDeleteOperator = async (operatorId: string) => {
    if (!activeOperator || !isManager || operatorId === 'op-01' || operatorId === activeOperator.id) {
      return;
    }
    if (syncMode === 'cloud' && storeInfo) {
      await deleteOperatorInFirestore(storeInfo.storeId, operatorId);
    } else if (syncMode === 'local' && activeLocalAccount) {
      deleteLocalAccountOperator(activeLocalAccount.id, operatorId);
      setLocalAccounts(getLocalAccounts());
    }
  };

  const handleUpdateStoreName = async (name: string) => {
    if (!activeOperator || !isManager) return;
    if (syncMode === 'cloud' && storeInfo) {
      await updateStoreNameInFirestore(storeInfo.storeId, name);
      setStoreInfo((prev) => (prev ? { ...prev, name } : prev));
    } else if (syncMode === 'local' && activeLocalAccount) {
      updateLocalAccountStoreName(activeLocalAccount.id, name);
      setLocalAccounts(getLocalAccounts());
    }
  };

  const handleSyncLocalAccountToCloud = async (localId: string): Promise<number> => {
    if (!activeOperator || !isManager || !authUser || !storeInfo) return 0;
    const allLocal = await getAllProducts(localId);
    return syncLocalProductsToCloud(
      storeInfo.storeId,
      storeInfo.ownerId,
      authUser.uid,
      allLocal,
    );
  };

  const getHeaderTitle = (): string | undefined => {
    if (view === 'details') return 'Detalhes do Produto';
    if (view === 'form') {
      return currentActiveProduct ? 'Ajuste de Preço' : 'Novo Produto';
    }
    return undefined;
  };

  const handleBack = () => {
    if (view === 'form' && returnView === 'details' && currentActiveProduct) {
      setView('details');
      return;
    }
    if (returnView && returnView !== view) {
      setView(returnView);
      return;
    }
    setView('home');
  };

  const waitingCloudOperators = syncMode === 'cloud' && !cloudOperatorsReady;
  const loading = !localReady || !authReady || cloudBooting || waitingCloudOperators;
  const activeStoreName =
    syncMode === 'cloud'
      ? storeInfo?.name
      : activeLocalAccount?.storeName;

  const isStoreUnlocked = syncMode !== 'none' && Boolean(activeOperator);

  return (
    <div className="min-h-screen flex flex-col bg-[#faf8ff] text-[#131b2e]">
      <TopBar
        view={view}
        title={getHeaderTitle()}
        syncMode={syncMode}
        activeOperator={activeOperator}
        canEditPrices={canEditPrices}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onOpenAccount={() => setAccountModalOpen(true)}
        onLockRegister={handleLockRegister}
      />

      <UpdateBannerModal
        updateInfo={updateInfo}
        dismissedVersion={dismissedUpdateVersion}
        onDismiss={setDismissedUpdateVersion}
      />

      <main className="flex-1 w-full">
        {loading ? (
          <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-[#2563eb] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-[#434655]">
              {cloudBooting || waitingCloudOperators
                ? 'Carregando loja e perfis na nuvem...'
                : 'Inicializando ProntoPreço...'}
            </p>
          </div>
        ) : syncMode === 'none' ? (
          <AccountModal
            isOpen={true}
            embedded={true}
            onClose={() => {}}
            authUser={authUser}
            storeInfo={storeInfo}
            operators={operators}
            activeOperator={activeOperator}
            syncMode={syncMode}
            localAccounts={localAccounts}
            activeLocalAccount={activeLocalAccount}
            localAccountProductCounts={localAccountProductCounts}
            onAuthRefresh={async () => {
              setAuthCheckNonce((n) => n + 1);
            }}
            onSignOutCloud={handleSignOutCloud}
            onSelectLocalAccount={handleSelectLocalAccount}
            onCreateLocalAccount={handleCreateLocalAccount}
            onExitLocalAccount={handleExitLocalAccount}
            onSelectOperator={handleSelectOperator}
            onLockRegister={handleLockRegister}
            onSaveOperator={handleSaveOperator}
            onDeleteOperator={handleDeleteOperator}
            onUpdateStoreName={handleUpdateStoreName}
            onSyncLocalAccountToCloud={handleSyncLocalAccountToCloud}
            updateInfo={updateInfo}
            checkingUpdates={checkingUpdates}
            onCheckUpdates={runUpdateCheck}
          />
        ) : !activeOperator ? (
          <ProfileLockScreen
            storeId={activeStoreId}
            storeName={activeStoreName || 'Loja ProntoPreço'}
            syncMode={syncMode}
            accountLabel={syncMode === 'cloud' ? authUser?.email || undefined : undefined}
            operators={operators}
            onUnlockOperator={handleSelectOperator}
            onSwitchStoreAccount={
              syncMode === 'cloud' ? handleSignOutCloud : handleExitLocalAccount
            }
          />
        ) : (
          <>
            {view === 'home' && (
              <HomeScreen
                products={products}
                logs={logs}
                todayScans={todayScans}
                syncMode={syncMode}
                storeName={activeStoreName}
                activeOperator={activeOperator}
                canEditPrices={canEditPrices}
                canConsultPrices={canConsultPrices}
                onStartScan={handleStartScan}
                onOpenProduct={handleOpenProduct}
                onRegisterBarcode={handleRegisterBarcode}
                onNavigate={(v) => handleNavigate(v)}
                onOpenAccount={() => setAccountModalOpen(true)}
              />
            )}

            {view === 'scanner' && (
              <ScannerScreen
                mode={scannerMode}
                products={products}
                canEditPrices={canEditPrices}
                findByBarcode={findProductInstant}
                onChangeMode={(nextMode) => {
                  if (nextMode === 'register' && !canEditPrices) {
                    setAccountModalOpen(true);
                    return;
                  }
                  setScannerMode(nextMode);
                }}
                onScanResolved={handleScanResolved}
                onBack={() => handleNavigate('home')}
              />
            )}

            {view === 'details' && currentActiveProduct && (
              <ProductDetailsScreen
                product={currentActiveProduct}
                syncMode={syncMode}
                canEditPrices={canEditPrices}
                canAdjustStock={canAdjustStock}
                onScanNext={() => handleStartScan('query')}
                onEdit={handleEditFromDetails}
                onAdjustStock={handleAdjustStock}
                onRequireManager={() => setAccountModalOpen(true)}
              />
            )}

            {view === 'form' && (
              <ProductFormScreen
                initialBarcode={formBarcode}
                existingProduct={currentActiveProduct}
                lockBarcode={formLockBarcode}
                syncMode={syncMode}
                canEditPrices={canEditPrices}
                operatorCode={operatorCode}
                onSave={handleSaveProduct}
                onDelete={handleDeleteProduct}
                onContinueScanning={() => handleStartScan('register')}
                onViewProduct={(saved) => {
                  setActiveProduct(saved);
                  setReturnView('home');
                  setView('details');
                }}
                onCancel={handleBack}
                onOpenAccount={() => setAccountModalOpen(true)}
              />
            )}

            {view === 'history' && (
              <HistoryCatalogScreen
                products={products}
                logs={logs}
                syncMode={syncMode}
                canEditPrices={canEditPrices}
                onOpenProduct={handleOpenProduct}
                onNewProduct={() => handleNavigate('form')}
                onOpenAccount={() => setAccountModalOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {isStoreUnlocked && (
        <BottomNav activeView={view} onNavigate={handleNavigate} />
      )}

      {isStoreUnlocked && (
        <AccountModal
          isOpen={accountModalOpen}
          onClose={() => setAccountModalOpen(false)}
          authUser={authUser}
          storeInfo={storeInfo}
          operators={operators}
          activeOperator={activeOperator}
          syncMode={syncMode}
          localAccounts={localAccounts}
          activeLocalAccount={activeLocalAccount}
          localAccountProductCounts={localAccountProductCounts}
          onAuthRefresh={async () => {
            setAuthCheckNonce((n) => n + 1);
          }}
          onSignOutCloud={handleSignOutCloud}
          onSelectLocalAccount={handleSelectLocalAccount}
          onCreateLocalAccount={handleCreateLocalAccount}
          onExitLocalAccount={handleExitLocalAccount}
          onSelectOperator={handleSelectOperator}
          onLockRegister={handleLockRegister}
          onSaveOperator={handleSaveOperator}
          onDeleteOperator={handleDeleteOperator}
          onUpdateStoreName={handleUpdateStoreName}
          onSyncLocalAccountToCloud={handleSyncLocalAccountToCloud}
          updateInfo={updateInfo}
          checkingUpdates={checkingUpdates}
          onCheckUpdates={runUpdateCheck}
        />
      )}
    </div>
  );
}
