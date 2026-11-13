import { useEffect, useState } from 'react';
import { assetUrl } from '../data/catalog';
import { useActions, useCatalog, useInventory } from '../data/hooks';
import { inventory } from '../data/inventory';
import { isFoilOnly, priceOf, sparklinePoints } from '../domain/pricing';
import { Price, RarityChip, Sparkline } from '../ui/parts';

const priceDate = (createdAt: string) => (createdAt ? new Date(createdAt.slice(0, 10)).toLocaleDateString('pl-PL') : '');

export function CardScreen({ printingId, onClose }: { printingId: string; onClose: () => void }) {
  const catalog = useCatalog();
  const { toast, openGrading } = useActions();
  const items = useInventory();
  const [currentId, setCurrentId] = useState(printingId);
  const printing = catalog.byId.get(currentId)!;
  const [foil, setFoil] = useState(() => isFoilOnly(printing, catalog.prices));
  useEffect(() => setFoil(isFoilOnly(catalog.byId.get(currentId)!, catalog.prices)), [currentId, catalog]);

  const siblings = catalog.bySlug.get(printing.cardSlug) ?? [printing];
  const entry = printing.cmProductId === null ? undefined : catalog.prices.prices[printing.cmProductId];
  const history = printing.cmProductId === null ? [] : catalog.history[printing.cmProductId] ?? [];
  const price = priceOf(printing, foil, catalog.prices);
  const owned = items.find((i) => i.printingId === printing.id && i.foil === foil);
  const hasBothPrices = !!entry && entry.trend !== null && entry.trendFoil !== null;

  const add = async () => {
    await inventory.add(printing.id, foil);
    toast('Dodano do inwentarza');
  };
  const grade = async () => {
    const item = owned ?? (await inventory.add(printing.id, foil));
    onClose();
    openGrading(item.id);
  };

  return (
    <div className="sheet" role="dialog" aria-label={printing.name}>
      <div className="screen">
        <div className="top">
          <button type="button" className="icon-btn" onClick={onClose}>Wróć</button>
          <span className="sub">nr {printing.collectorNumber}</span>
        </div>
        <img className="art" src={assetUrl(printing.imageUrl)} alt={printing.name} />
        <div className="pad">
          <h1 className="name">{printing.name}</h1>
          <p className="meta">{printing.set}</p>
          <RarityChip rarity={printing.rarity} />

          <div className="pricebox">
            <div>
              <span className="small dim">
                {price === null ? 'Cardmarket nie podaje ceny tej karty' : `Trend Cardmarket z ${priceDate(catalog.prices.createdAt)}`}
              </span>
              <Price value={price} />
            </div>
            <Sparkline points={sparklinePoints(history, entry, foil)} />
          </div>

          <div className="stack">
            {siblings.length > 1 && (
              <label className="stack small dim">
                Wydanie
                <select className="field" value={currentId} onChange={(e) => setCurrentId(e.target.value)}>
                  {siblings.map((s) => (
                    <option key={s.id} value={s.id}>{`${s.set}, nr ${s.collectorNumber}, ${s.rarity}`}</option>
                  ))}
                </select>
              </label>
            )}
            {hasBothPrices && (
              <label className="switch">
                <input type="checkbox" checked={foil} onChange={(e) => setFoil(e.target.checked)} />
                Wersja foil
              </label>
            )}
            {owned && (
              <div className="row">
                <span>W inwentarzu</span>
                <div className="stepper">
                  <button type="button" aria-label="Zmniejsz ilość" onClick={() => inventory.setQuantity(owned.id, owned.quantity - 1)}>−</button>
                  <output>{owned.quantity}</output>
                  <button type="button" aria-label="Zwiększ ilość" onClick={() => inventory.setQuantity(owned.id, owned.quantity + 1)}>+</button>
                </div>
              </div>
            )}
            {!owned && <button type="button" className="btn" onClick={add}>Dodaj do inwentarza</button>}
            <button type="button" className="btn alt" onClick={grade}>
              {owned?.grade ? 'Zobacz grading' : 'Wyślij do gradingu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
