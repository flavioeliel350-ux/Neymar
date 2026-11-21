import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import {
  AppView,
  LocalAccount,
  Product,
  ScanLog,
  ScannerMode,
  StoreInfo,
  StoreOperator,
} from './types/product';
import {
  addScanLog,
  adjustProductStock,
  createLocalAccount,
  deleteLocalAccountOperator,
  deleteProduct,
  findProductByBarcode,
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
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { AccountModal } from './components/AccountModal';
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
  const [cloudBooting, setCloudBooting] = useState(false);

  const [activeOperatorId, setActiveOperatorId] = useState<string>('');
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const [view, setView] = useState<AppView>('home');
  const [returnView, setReturnView] = useState<AppView>('home');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('query');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [formBarcode, setFormBarcode] = useState<string>('');
  const [formLockBarcode, setFormLockBarcode] = useState<boolean>(false);

  if (fatalError) {
    throw fatalError;
  }

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
        setCloudBooting(false);
        setAuthReady(true);
        return;
      }

      setCloudBooting(true);
      try {
        const { store } = await ensureUserAndStore(user);
        if (!active) return;
        setStoreInfo(store);
        setActiveProduct(null);
        setView('home');

        const savedOpId = localStorage.getItem(`prontopreco_active_op_${store.storeId}`);
        if (savedOpId) {
          setActiveOperatorId(savedOpId);
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
            if (active) setCloudOperators(items);
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

  const operators = useMemo(() => {
    if (syncMode === 'cloud') return cloudOperators;
    if (syncMode === 'local' && activeLocalAccount) return activeLocalAccount.operators;
    return [];
  }, [syncMode, cloudOperators, activeLocalAccount]);

  const activeOperator = useMemo<StoreOperator | null>(() => {
    if (syncMode === 'none' || operators.length === 0) return null;
    const storeKey = syncMode === 'cloud' ? storeInfo?.storeId : activeLocalAccount?.id;
    const savedId =
      activeOperatorId ||
      (storeKey ? localStorage.getItem(`prontopreco_active_op_${storeKey}`) || '' : '');
    const matched = operators.find((op) => op.id === savedId && op.active);
    if (matched) return matched;
    return operators.find((op) => op.role === 'admin' && op.active) || operators[0] || null;
  }, [syncMode, operators, activeOperatorId, storeInfo, activeLocalAccount]);

  const canEditPrices = activeOperator?.role === 'admin';
  const operatorCode = activeOperator?.code || 'Op. 01';

  const products = syncMode === 'cloud' ? cloudProducts : localProducts;
  const logs = syncMode === 'cloud' ? cloudLogs : localLogs;

  const todayScans = useMemo(() => {
    if (syncMode === 'local') return localTodayScans;
    const todayKey = new Date().toDateString();
    return cloudLogs.filter(
      (l) => new Date(l.timestamp).toDateString() === todayKey,
    ).length;
  }, [syncMode, localTodayScans, cloudLogs]);

  const currentActiveProduct = useMemo(() => {
    if (!activeProduct) return null;
    return products.find((p) => p.barcode === activeProduct.barcode) || activeProduct;
  }, [activeProduct, products]);

  const handleSelectOperator = (op: StoreOperator) => {
    setActiveOperatorId(op.id);
    const storeKey = syncMode === 'cloud' ? storeInfo?.storeId : activeLocalAccount?.id;
    if (storeKey) {
      localStorage.setItem(`prontopreco_active_op_${storeKey}`, op.id);
    }
  };

  const handleSelectLocalAccount = async (accountId: string) => {
    setActiveLocalAccountId(accountId);
    setActiveLocalAccountIdState(accountId);
    setActiveOperatorId('');
    setActiveProduct(null);
    setView('home');
    await refreshLocalStoreData(accountId);
  };

  const handleCreateLocalAccount = async (
    storeName: string,
    managerName: string,
    managerPin: string,
  ) => {
    const acc = createLocalAccount(storeName, managerName, managerPin);
    await refreshLocalAccountsAndCounts();
    setActiveLocalAccountIdState(acc.id);
    setActiveOperatorId('op-01');
    setActiveProduct(null);
    setView('home');
    await refreshLocalStoreData(acc.id);
  };

  const handleExitLocalAccount = () => {
    setActiveLocalAccountId(null);
    setActiveLocalAccountIdState(null);
    setActiveOperatorId('');
    setActiveProduct(null);
    setLocalProducts([]);
    setLocalLogs([]);
    setLocalTodayScans(0);
    setAccountModalOpen(false);
    setView('home');
  };

  const handleNavigate = (nextView: AppView, mode?: ScannerMode) => {
    if (syncMode === 'none') return;
    if (mode) setScannerMode(mode);
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
    if (syncMode === 'none') return;
    if (mode === 'register' && !canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    setScannerMode(mode);
    setView('scanner');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const recordScanLog = async (entry: Omit<ScanLog, 'id' | 'timestamp'>) => {
    if (syncMode === 'cloud' && authUser && storeInfo) {
      await addScanLogToFirestore(storeInfo.storeId, storeInfo.ownerId, authUser.uid, {
        ...entry,
        operator: operatorCode,
      });
    } else if (syncMode === 'local' && activeLocalAccount) {
      await addScanLog(activeLocalAccount.id, { ...entry, operator: operatorCode });
      await refreshLocalStoreData(activeLocalAccount.id);
    }
  };

  const handleOpenProduct = async (product: Product) => {
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
    if (!canEditPrices) {
      setAccountModalOpen(true);
      return;
    }
    const existing = products.find((p) => p.barcode === barcode) || null;
    setReturnView(view === 'form' ? 'home' : view);
    setActiveProduct(existing);
    setFormBarcode(barcode);
    setFormLockBarcode(Boolean(barcode));
    setView('form');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleScanResolved = async (barcode: string, mode: ScannerMode) => {
    const found =
      syncMode === 'cloud'
        ? products.find((p) => p.barcode === barcode) || null
        : activeLocalAccount
          ? await findProductByBarcode(activeLocalAccount.id, barcode)
          : null;

    if (mode === 'query') {
      if (found) {
        await recordScanLog({
          barcode: found.barcode,
          productName: found.name,
          price: found.price,
          action: 'consulta',
        });
        setReturnView('scanner');
        setActiveProduct(found);
        setView('details');
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
      return;
    }

    if (!canEditPrices) {
      setAccountModalOpen(true);
      return;
    }

    setReturnView('scanner');
    setActiveProduct(found);
    setFormBarcode(barcode);
    setFormLockBarcode(true);
    setView('form');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleEditFromDetails = (product: Product) => {
    if (!canEditPrices) {
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

  const handleSaveProduct = async (
    payload: Omit<Product, 'updatedAt'>,
  ): Promise<Product> => {
    const existedBefore = Boolean(
      products.find((p) => p.barcode === payload.barcode),
    );

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
    const existing = products.find((p) => p.barcode === barcode);
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

  const handleSignOutCloud = async () => {
    await signOut(auth);
    setActiveOperatorId('');
    setActiveProduct(null);
    setView('home');
  };

  const handleSaveOperator = async (
    op: Omit<StoreOperator, 'storeId' | 'ownerId'>,
  ) => {
    if (syncMode === 'cloud' && storeInfo) {
      await saveOperatorToFirestore(storeInfo.storeId, storeInfo.ownerId, op);
    } else if (syncMode === 'local' && activeLocalAccount) {
      saveLocalAccountOperator(activeLocalAccount.id, op);
      setLocalAccounts(getLocalAccounts());
    }
  };

  const handleDeleteOperator = async (operatorId: string) => {
    if (syncMode === 'cloud' && storeInfo) {
      await deleteOperatorInFirestore(storeInfo.storeId, operatorId);
    } else if (syncMode === 'local' && activeLocalAccount) {
      deleteLocalAccountOperator(activeLocalAccount.id, operatorId);
      setLocalAccounts(getLocalAccounts());
    }
  };

  const handleUpdateStoreName = async (name: string) => {
    if (syncMode === 'cloud' && storeInfo) {
      await updateStoreNameInFirestore(storeInfo.storeId, name);
      setStoreInfo((prev) => (prev ? { ...prev, name } : prev));
    } else if (syncMode === 'local' && activeLocalAccount) {
      updateLocalAccountStoreName(activeLocalAccount.id, name);
      setLocalAccounts(getLocalAccounts());
    }
  };

  const handleSyncLocalAccountToCloud = async (localId: string): Promise<number> => {
    if (!authUser || !storeInfo) return 0;
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

  const loading = !localReady || !authReady || cloudBooting;
  const activeStoreName =
    syncMode === 'cloud'
      ? storeInfo?.name
      : activeLocalAccount?.storeName;

  return (
    <div className="min-h-screen flex flex-col bg-[#faf8ff] text-[#131b2e]">
      <TopBar
        view={view}
        title={getHeaderTitle()}
        syncMode={syncMode}
        activeOperator={activeOperator}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onOpenAccount={() => setAccountModalOpen(true)}
      />

      <main className="flex-1 w-full">
        {loading ? (
          <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-[#2563eb] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-[#434655]">
              {cloudBooting ? 'Carregando loja na nuvem...' : 'Inicializando ProntoPreço...'}
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
            onSaveOperator={handleSaveOperator}
            onDeleteOperator={handleDeleteOperator}
            onUpdateStoreName={handleUpdateStoreName}
            onSyncLocalAccountToCloud={handleSyncLocalAccountToCloud}
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
                onChangeMode={setScannerMode}
                onScanResolved={handleScanResolved}
                onBack={() => handleNavigate('home')}
              />
            )}

            {view === 'details' && currentActiveProduct && (
              <ProductDetailsScreen
                product={currentActiveProduct}
                syncMode={syncMode}
                canEditPrices={canEditPrices}
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

      {syncMode !== 'none' && (
        <BottomNav activeView={view} onNavigate={handleNavigate} />
      )}

      {syncMode !== 'none' && (
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
          onSaveOperator={handleSaveOperator}
          onDeleteOperator={handleDeleteOperator}
          onUpdateStoreName={handleUpdateStoreName}
          onSyncLocalAccountToCloud={handleSyncLocalAccountToCloud}
        />
      )}
    </div>
  );
}
