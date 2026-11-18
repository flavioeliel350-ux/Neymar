import React, { useCallback, useEffect, useState } from 'react';
import { AppView, Product, ScanLog, ScannerMode } from './types/product';
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
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { HomeScreen } from './screens/HomeScreen';
import { ScannerScreen } from './screens/ScannerScreen';
import { ProductDetailsScreen } from './screens/ProductDetailsScreen';
import { ProductFormScreen } from './screens/ProductFormScreen';
import { HistoryCatalogScreen } from './screens/HistoryCatalogScreen';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [todayScans, setTodayScans] = useState(0);

  const [view, setView] = useState<AppView>('home');
  const [returnView, setReturnView] = useState<AppView>('home');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('query');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [formBarcode, setFormBarcode] = useState<string>('');
  const [formLockBarcode, setFormLockBarcode] = useState<boolean>(false);

  const refreshData = useCallback(async () => {
    const [allProds, recentLogs, countToday] = await Promise.all([
      getAllProducts(),
      getScanLogs(50),
      getTodayScanCount(),
    ]);
    setProducts(allProds);
    setLogs(recentLogs);
    setTodayScans(countToday);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      await initDatabase();
      if (!mounted) return;
      await refreshData();
      if (mounted) setLoading(false);
    }
    boot();
    return () => {
      mounted = false;
    };
  }, [refreshData]);

  const handleNavigate = (nextView: AppView, mode?: ScannerMode) => {
    if (mode) setScannerMode(mode);
    if (nextView === 'form') {
      setReturnView(view);
      setActiveProduct(null);
      setFormBarcode('');
      setFormLockBarcode(false);
    }
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleStartScan = (mode: ScannerMode) => {
    setScannerMode(mode);
    setView('scanner');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleOpenProduct = async (product: Product) => {
    await addScanLog({
      barcode: product.barcode,
      productName: product.name,
      price: product.price,
      action: 'consulta',
    });
    await refreshData();
    setReturnView(view === 'details' || view === 'form' ? 'home' : view);
    setActiveProduct(product);
    setView('details');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleRegisterBarcode = (barcode: string) => {
    const existing = products.find((p) => p.barcode === barcode) || null;
    setReturnView(view === 'form' ? 'home' : view);
    setActiveProduct(existing);
    setFormBarcode(barcode);
    setFormLockBarcode(Boolean(barcode));
    setView('form');
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  };

  const handleScanResolved = async (barcode: string, mode: ScannerMode) => {
    const found = await findProductByBarcode(barcode);

    if (mode === 'query') {
      if (found) {
        await addScanLog({
          barcode: found.barcode,
          productName: found.name,
          price: found.price,
          action: 'consulta',
        });
        await refreshData();
        setReturnView('scanner');
        setActiveProduct(found);
        setView('details');
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
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
    const saved = await upsertProduct(payload);
    await addScanLog({
      barcode: saved.barcode,
      productName: saved.name,
      price: saved.price,
      action: existedBefore ? 'ajuste' : 'cadastro',
    });
    await refreshData();
    setActiveProduct(saved);
    return saved;
  };

  const handleDeleteProduct = async (barcode: string) => {
    await deleteProduct(barcode);
    await refreshData();
    setActiveProduct(null);
    setView('history');
  };

  const handleAdjustStock = async (barcode: string, delta: number) => {
    const updated = await adjustProductStock(barcode, delta);
    if (updated) {
      setActiveProduct(updated);
      await refreshData();
    }
  };

  const handleResetSeed = async () => {
    await resetCatalogToSeed();
    await refreshData();
  };

  const getHeaderTitle = (): string | undefined => {
    if (view === 'details') return 'Detalhes do Produto';
    if (view === 'form') {
      return activeProduct ? 'Ajuste de Preço' : 'Novo Produto';
    }
    return undefined;
  };

  const handleBack = () => {
    if (view === 'form' && returnView === 'details' && activeProduct) {
      setView('details');
      return;
    }
    if (returnView && returnView !== view) {
      setView(returnView);
      return;
    }
    setView('home');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf8ff] text-[#131b2e]">
      <TopBar
        view={view}
        title={getHeaderTitle()}
        onNavigate={handleNavigate}
        onBack={handleBack}
      />

      <main className="flex-1 w-full">
        {loading ? (
          <div className="max-w-6xl mx-auto px-4 py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-3 border-[#2563eb] border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-[#434655]">
              Carregando banco local...
            </p>
          </div>
        ) : (
          <>
            {view === 'home' && (
              <HomeScreen
                products={products}
                logs={logs}
                todayScans={todayScans}
                onStartScan={handleStartScan}
                onOpenProduct={handleOpenProduct}
                onRegisterBarcode={handleRegisterBarcode}
                onNavigate={(v) => handleNavigate(v)}
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

            {view === 'details' && activeProduct && (
              <ProductDetailsScreen
                product={activeProduct}
                onScanNext={() => handleStartScan('query')}
                onEdit={handleEditFromDetails}
                onAdjustStock={handleAdjustStock}
              />
            )}

            {view === 'form' && (
              <ProductFormScreen
                initialBarcode={formBarcode}
                existingProduct={activeProduct}
                lockBarcode={formLockBarcode}
                onSave={handleSaveProduct}
                onDelete={handleDeleteProduct}
                onContinueScanning={() => handleStartScan('register')}
                onViewProduct={(saved) => {
                  setActiveProduct(saved);
                  setReturnView('home');
                  setView('details');
                }}
                onCancel={handleBack}
              />
            )}

            {view === 'history' && (
              <HistoryCatalogScreen
                products={products}
                logs={logs}
                onOpenProduct={handleOpenProduct}
                onNewProduct={() => handleNavigate('form')}
                onResetSeed={handleResetSeed}
              />
            )}
          </>
        )}
      </main>

      <BottomNav activeView={view} onNavigate={handleNavigate} />
    </div>
  );
}
