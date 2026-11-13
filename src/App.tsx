import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCatalog, type Catalog } from './data/catalog';
import { ActionsContext, CatalogContext, type AppActions } from './data/hooks';
import { CardScreen } from './screens/Card';
import { GradingScreen } from './screens/Grading';
import { InventoryScreen } from './screens/Inventory';
import { PricesScreen } from './screens/Prices';
import { ScannerScreen } from './screens/Scanner';

type Tab = 'scanner' | 'inventory' | 'grading' | 'prices';
const TABS: Array<[Tab, string]> = [['scanner', 'Skaner'], ['inventory', 'Inwentarz'], ['grading', 'Grading'], ['prices', 'Ceny']];

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inventory');
  const [cardId, setCardId] = useState<string | null>(null);
  const [gradingItemId, setGradingItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const toastTimer = useRef(0);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setLoadError(e.message));
  }, []);

  const showToast = useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const actions = useMemo<AppActions>(() => ({
    toast: showToast,
    openCard: setCardId,
    openGrading: (itemId) => {
      setGradingItemId(itemId);
      setTab('grading');
    },
  }), [showToast]);

  if (loadError) {
    return (
      <div className="app">
        <div className="empty">
          <b>Nie udało się wczytać bazy kart</b>
          {loadError}. Sprawdź połączenie i otwórz aplikację ponownie.
        </div>
      </div>
    );
  }
  if (!catalog) return <div className="app"><div className="empty">Wczytywanie bazy kart…</div></div>;

  return (
    <CatalogContext.Provider value={catalog}>
      <ActionsContext.Provider value={actions}>
        <div className="app">
          {tab === 'scanner' && <ScannerScreen />}
          {tab === 'inventory' && <InventoryScreen />}
          {tab === 'grading' && <GradingScreen itemId={gradingItemId} onSelect={setGradingItemId} />}
          {tab === 'prices' && <PricesScreen />}
          <nav className="nav" aria-label="Główna nawigacja">
            {TABS.map(([key, label]) => (
              <button type="button" key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>
            ))}
          </nav>
          {cardId && <CardScreen key={cardId} printingId={cardId} onClose={() => setCardId(null)} />}
          {toast && <div className={`toast ${toast.error ? 'err' : ''}`} role="status">{toast.message}</div>}
        </div>
      </ActionsContext.Provider>
    </CatalogContext.Provider>
  );
}
