import { useMemo, useRef, useState } from 'react';
import { useActions, useCatalog, useInventory } from '../data/hooks';
import { inventory } from '../data/inventory';
import { inventoryRows, type SortKey } from '../domain/inventoryView';
import { collectionChange, collectionValue, formatEur } from '../domain/pricing';
import { cardsWord } from '../domain/plural';
import { CardRow, Price, RarityChip } from '../ui/parts';

const SORTS: Array<[SortKey, string]> = [['price', 'Cena'], ['rarity', 'Rarity'], ['number', 'Numer']];

export function StaleNotice() {
  const { prices, pricesStale } = useCatalog();
  if (!pricesStale) return null;
  const date = prices.createdAt ? new Date(prices.createdAt.slice(0, 10)).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' }) : null;
  return <p className="notice">{date ? `Ceny z dnia ${date}, mogą być nieaktualne` : 'Nie udało się pobrać cen'}</p>;
}

async function saveBackup(text: string) {
  const name = `kolekcja-night-city-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function InventoryScreen() {
  const catalog = useCatalog();
  const { toast, openCard } = useActions();
  const items = useInventory();
  const [sort, setSort] = useState<SortKey>('price');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => inventoryRows(items, catalog.byId, catalog.prices, sort, query), [items, catalog, sort, query]);
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const value = collectionValue(items, catalog.byId, catalog.prices);
  const change = collectionChange(items, catalog.byId, catalog.prices, catalog.history);

  const exportBackup = async () => {
    try {
      await saveBackup(await inventory.exportJson());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Nie udało się zapisać kopii', true);
    }
    setMenu(false);
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await inventory.importJson(await file.text());
      toast(`Wczytano kopię: ${n} pozycji`);
    } catch (e) {
      toast((e as Error).message, true);
    }
    setMenu(false);
  };

  return (
    <div className="screen">
      <div className="top">
        <h1>Inwentarz</h1>
        <button type="button" className="icon-btn" onClick={() => setMenu(true)}>Kopia</button>
      </div>
      <StaleNotice />
      <div className="total panel cut">
        <span className="small dim">Wartość kolekcji, {count} {cardsWord(count)}</span>
        <Price value={value} />
        {change !== null && (
          <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>
            {change >= 0 ? '+' : '−'}{formatEur(Math.abs(change))} od poprzedniego dnia
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <b>Inwentarz jest pusty</b>
          Zeskanuj pierwszą kartę w zakładce Skaner albo znajdź ją w zakładce Ceny.
        </div>
      ) : (
        <>
          <div className="pad stack" style={{ marginBottom: 8 }}>
            <input className="field" type="search" placeholder="Szukaj po nazwie" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="seg" role="group" aria-label="Sortowanie">
              {SORTS.map(([key, label]) => (
                <button type="button" key={key} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}</button>
              ))}
            </div>
          </div>
          {rows.length === 0 && <div className="empty">Żadna karta nie pasuje do „{query}”.</div>}
          {rows.map(({ item, printing, price }) => (
            <CardRow
              key={item.id}
              printing={printing}
              onClick={() => openCard(printing.id)}
              detail={<>
                <RarityChip rarity={printing.rarity} plain />, {printing.set} {printing.collectorNumber}
                {item.grade && `, ocena ${String(item.grade.overall).replace('.', ',')}`}
                {item.gradingStatus === 'waiting' && ', czeka na ocenę'}
              </>}
              right={<><Price value={price} /><small>×{item.quantity}</small></>}
            />
          ))}
        </>
      )}

      {menu && (
        <div className="backdrop" onClick={() => setMenu(false)}>
          <div className="chooser" onClick={(e) => e.stopPropagation()}>
            <h2>Kopia inwentarza</h2>
            <div className="pad stack">
              <p className="small dim">Inwentarz jest zapisany tylko w tym telefonie. Kopia w pliku pozwala go odtworzyć.</p>
              <button type="button" className="btn" onClick={exportBackup}>Eksportuj kopię</button>
              <button type="button" className="btn alt" onClick={() => fileRef.current?.click()}>Importuj kopię</button>
              <p className="small dim">Import zastępuje obecny inwentarz zawartością pliku.</p>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
