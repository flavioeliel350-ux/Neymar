import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import {
  AppView,
  Product,
  ScanLog,
  ScannerMode,
  StoreInfo,
  StoreOperator,
} from './types/product';
import {
  addScanLog,
  adjustProductStock,
  deleteProduct,
  findProductByBarcode,
  getAllProducts,
  getScanLogs,
  getTodayScanCount,
  initDatabase,
  resetCatalogToSeed,
  upsertProduct,
} from './database/productRepository';
import {
  auth,
  googleProvider,
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

  const [localLoading, setLocalLoading] = useState(true);
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [localLogs, setLocalLogs] = useState<ScanLog[]>([]);
  const [localTodayScans, setLocalTodayScans] = useState(0);

  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [cloudProducts, setCloudProducts] = useState<Product[]>([]);
  const [cloudLogs, setCloudLogs] = useState<ScanLog[]>([]);
  const [operators, setOperators] = useState<StoreOperator[]>([]);
  const [activeOperatorId, setActiveOperatorId] = useState<string>('');
  const [cloudBooting, setCloudBooting] = useState(false);

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

  const refreshLocalData = useCallback(async () => {
    const [allProds, recentLogs, countToday] = await Promise.all([
      getAllProducts(),
      getScanLogs(50),
      getTodayScanCount(),
    ]);
    setLocalProducts(allProds);
    setLocalLogs(recentLogs);
    setLocalTodayScans(countToday);
  }, []);

  // Boot local IndexedDB + verify Firestore connectivity
  useEffect(() => {
    let mounted = true;
    async function boot() {
      void testConnection();
      await initDatabase();
      if (!mounted) return;
      await refreshLocalData();
      if (mounted) setLocalLoading(false);
    }
    boot();
    return () => {
      mounted = false;
    };
  }, [refreshLocalData]);

  // Listen to Firebase Auth and mount real-time Firestore listeners once signed in
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

      if (!user) {
        setStoreInfo(null);
        setCloudProducts([]);
        setCloudLogs([]);
        setOperators([]);
        setActiveOperatorId('');
        setCloudBooting(false);
        setAuthReady(true);
        return;
      }

      setCloudBooting(true);
      try {
        const { store } = await ensureUserAndStore(user);
        if (!active) return;
        setStoreInfo(store);

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
          (items) => {
            if (active) setCloudProducts(items);
          },
          reportSnapshotError(`stores/${store.storeId}/products`),
        );

        unsubLogs = subscribeStoreScanLogs(
          store.storeId,
          (items) => {
            if (active) setCloudLogs(items);
          },
          reportSnapshotError(`stores/${store.storeId}/scanLogs`),
        );

        unsubOperators = subscribeStoreOperators(
          store.storeId,
          (items) => {
            if (active) setOperators(items);
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
  }, []);

  const syncMode: 'cloud' | 'offline' = authUser && storeInfo ? 'cloud' : 'offline';

  const activeOperator = useMemo<StoreOperator | null>(() => {
    if (syncMode !== 'cloud' || operators.length === 0) return null;
    const matched = operators.find((op) => op.id === activeOperatorId && op.active);
    if (matched) return matched;
    return operators.find((op) => op.role === 'admin' && op.active) || operators[0] || null;
  }, [syncMode, operators, activeOperatorId]);

  const canEditPrices = syncMode === 'offline' || activeOperator?.role === 'admin';
  const operatorCode = activeOperator?.code || 'Op. 01';

  const products = syncMode === 'cloud' ? cloudProducts : localProducts;
  const logs = syncMode === 'cloud' ? cloudLogs : localLogs;

  const todayScans = useMemo(() => {
    if (syncMode === 'offline') return localTodayScans;
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
    if (storeInfo) {
      localStorage.setItem(`prontopreco_active_op_${storeInfo.storeId}`, op.id);
    }
  };

  const handleNavigate = (nextView: AppView, mode?: ScannerMode) => {
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
    } else {
      await addScanLog({ ...entry, operator: operatorCode });
      await refreshLocalData();
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
        : await findProductByBarcode(barcode);

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

    // register mode
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

    const saved = await upsertProduct(payload);
    await addScanLog({
      barcode: saved.barcode,
      productName: saved.name,
      price: saved.price,
      action: existedBefore ? 'ajuste' : 'cadastro',
      operator: operatorCode,
    });
    await refreshLocalData();
    setActiveProduct(saved);
    return saved;
  };

  const handleDeleteProduct = async (barcode: string) => {
    if (syncMode === 'cloud' && storeInfo) {
      await deleteProductInFirestore(storeInfo.storeId, barcode);
    } else {
      await deleteProduct(barcode);
      await refreshLocalData();
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

    const updated = await adjustProductStock(barcode, delta);
    if (updated) {
      setActiveProduct(updated);
      await refreshLocalData();
    }
  };

  const handleResetSeed = async () => {
    await resetCatalogToSeed();
    await refreshLocalData();
  };

  const handleSignInGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleSaveOperator = async (
    op: Omit<StoreOperator, 'storeId' | 'ownerId'>,
  ) => {
    if (!storeInfo) return;
    await saveOperatorToFirestore(storeInfo.storeId, storeInfo.ownerId, op);
  };

  const handleDeleteOperator = async (operatorId: string) => {
    if (!storeInfo) return;
    await deleteOperatorInFirestore(storeInfo.storeId, operatorId);
  };

  const handleUpdateStoreName = async (name: string) => {
    if (!storeInfo) return;
    await updateStoreNameInFirestore(storeInfo.storeId, name);
    setStoreInfo((prev) => (prev ? { ...prev, name } : prev));
  };

  const handleSyncLocalToCloud = async (): Promise<number> => {
    if (!authUser || !storeInfo) return 0;
    const allLocal = await getAllProducts();
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

  const loading = localLoading || !authReady || cloudBooting;

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
              {cloudBooting ? 'Sincronizando loja na nuvem...' : 'Carregando banco local...'}
            </p>
          </div>
        ) : (
          <>
            {view === 'home' && (
              <HomeScreen
                products={products}
                logs={logs}
                todayScans={todayScans}
                syncMode={syncMode}
                storeName={storeInfo?.name}
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
                onResetSeed={handleResetSeed}
                onOpenAccount={() => setAccountModalOpen(true)}
              />
            )}
          </>
        )}
      </main>

      <BottomNav activeView={view} onNavigate={handleNavigate} />

      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        authUser={authUser}
        storeInfo={storeInfo}
        operators={operators}
        activeOperator={activeOperator}
        localProductsCount={localProducts.length}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onSelectOperator={handleSelectOperator}
        onSaveOperator={handleSaveOperator}
        onDeleteOperator={handleDeleteOperator}
        onUpdateStoreName={handleUpdateStoreName}
        onSyncLocalToCloud={handleSyncLocalToCloud}
      />
    </div>
  );
}
