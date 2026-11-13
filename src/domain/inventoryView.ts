import { priceOf } from './pricing';
import { RARITY_ORDER, type InventoryItem, type PriceFile, type Printing } from './types';

export type SortKey = 'price' | 'rarity' | 'number';

/** Tekst bez znaków diakrytycznych i wielkich liter, do wyszukiwania. */
export function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
}

export function matchesQuery(p: Printing, query: string): boolean {
  const q = fold(query.trim());
  return q === '' || fold(p.name).includes(q);
}

const collectorNum = (p: Printing) => parseInt(p.collectorNumber.replace(/\D/g, ''), 10) || 0;

export interface Row { item: InventoryItem; printing: Printing; price: number | null }

/** Pozycje inwentarza z danymi karty, przefiltrowane i posortowane. Pozycje nieznanych kart są pomijane. */
export function inventoryRows(
  items: InventoryItem[], byId: Map<string, Printing>, prices: PriceFile, sort: SortKey, query = '',
): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const printing = byId.get(item.printingId);
    if (printing && matchesQuery(printing, query)) rows.push({ item, printing, price: priceOf(printing, item.foil, prices) });
  }
  const byName = (a: Row, b: Row) => a.printing.name.localeCompare(b.printing.name, 'pl');
  const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
    price: (a, b) => (b.price ?? -1) - (a.price ?? -1) || byName(a, b),
    rarity: (a, b) => RARITY_ORDER.indexOf(b.printing.rarity) - RARITY_ORDER.indexOf(a.printing.rarity) || byName(a, b),
    number: (a, b) => a.printing.set.localeCompare(b.printing.set) || collectorNum(a.printing) - collectorNum(b.printing) || byName(a, b),
  };
  return rows.sort(cmp[sort]);
}
