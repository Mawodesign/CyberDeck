import { useMemo, useState } from 'react';
import { useActions, useCatalog, useInventory } from '../data/hooks';
import { matchesQuery } from '../domain/inventoryView';
import { formatEur, previousPrice, priceOf } from '../domain/pricing';
import { CardRow, Price, RarityChip } from '../ui/parts';
import { StaleNotice } from './Inventory';

const MAX_RESULTS = 60;

export function PricesScreen() {
  const catalog = useCatalog();
  const { openCard } = useActions();
  const items = useInventory();
  const [query, setQuery] = useState('');

  const results = useMemo(
    () => (query.trim().length < 2 ? [] : catalog.printings.filter((p) => matchesQuery(p, query))),
    [catalog, query],
  );

  const movers = useMemo(() => {
    const out = [];
    for (const item of items) {
      const printing = catalog.byId.get(item.printingId);
      if (!printing) continue;
      const now = priceOf(printing, item.foil, catalog.prices);
      const prev = previousPrice(printing, item.foil, catalog.prices, catalog.history);
      if (now === null || prev === null || now === prev) continue;
      out.push({ item, printing, now, diff: now - prev });
    }
    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);
  }, [items, catalog]);

  const date = catalog.prices.createdAt ? new Date(catalog.prices.createdAt.slice(0, 10)).toLocaleDateString('pl-PL') : 'brak';

  return (
    <div className="screen">
      <div className="top">
        <h1>Ceny</h1>
        <span className="sub">Cardmarket, {date}</span>
      </div>
      <StaleNotice />
      <div className="pad" style={{ marginBottom: 10 }}>
        <input className="field" type="search" placeholder="Szukaj karty w całej bazie" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {query.trim().length >= 2 ? (
        <>
          {results.length === 0 && <div className="empty">Żadna karta nie pasuje do „{query}”.</div>}
          {results.slice(0, MAX_RESULTS).map((p) => (
            <CardRow
              key={p.id}
              printing={p}
              onClick={() => openCard(p.id)}
              detail={<><RarityChip rarity={p.rarity} plain />, {p.set} {p.collectorNumber}</>}
              right={<Price value={priceOf(p, false, catalog.prices)} />}
            />
          ))}
          {results.length > MAX_RESULTS && <p className="pad small dim" style={{ marginTop: 10 }}>Pokazano {MAX_RESULTS} z {results.length}. Zawęź wyszukiwanie.</p>}
        </>
      ) : (
        <>
          <h2 className="pad" style={{ font: '600 15px var(--display)', margin: '6px 0 4px' }}>Największe zmiany w Twojej kolekcji</h2>
          {movers.length === 0 && (
            <p className="pad small dim">
              {items.length === 0
                ? 'Dodaj karty do inwentarza, żeby śledzić zmiany ich cen.'
                : 'Zmiany pojawią się, gdy aplikacja zbierze ceny z co najmniej dwóch dni.'}
            </p>
          )}
          {movers.map(({ item, printing, now, diff }) => (
            <CardRow
              key={item.id}
              printing={printing}
              onClick={() => openCard(printing.id)}
              detail={<><RarityChip rarity={printing.rarity} plain />, {printing.set}</>}
              right={<>
                <Price value={now} />
                <small className={`delta ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? '+' : '−'}{formatEur(Math.abs(diff))}</small>
              </>}
            />
          ))}
        </>
      )}
    </div>
  );
}
