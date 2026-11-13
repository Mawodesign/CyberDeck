import type { HistoryPoint, InventoryItem, PriceEntry, PriceFile, PriceHistory, Printing } from './types';

const eur = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'EUR' });

/** Kwota w formacie „84,90 €”; dla braku ceny „brak ceny”. */
export function formatEur(v: number | null): string {
  return v === null ? 'brak ceny' : eur.format(v).replace(/ /g, ' ');
}

/**
 * Cena trend karty. Cardmarket trzyma cenę większości kart tylko w jednym polu
 * (zwykła albo foil), więc gdy pole zgodne z przełącznikiem jest puste, bierzemy drugie.
 */
export function priceOf(p: Printing, foil: boolean, prices: PriceFile): number | null {
  const e = p.cmProductId === null ? undefined : prices.prices[p.cmProductId];
  if (!e) return null;
  return foil ? e.trendFoil ?? e.trend : e.trend ?? e.trendFoil;
}

/** Czy karta ma w Cardmarket wyłącznie cenę foil (domyślne ustawienie przełącznika). */
export function isFoilOnly(p: Printing, prices: PriceFile): boolean {
  const e = p.cmProductId === null ? undefined : prices.prices[p.cmProductId];
  return !!e && e.trend === null && e.trendFoil !== null;
}

export function collectionValue(items: InventoryItem[], byId: Map<string, Printing>, prices: PriceFile): number {
  let sum = 0;
  for (const it of items) {
    const p = byId.get(it.printingId);
    if (p) sum += (priceOf(p, it.foil, prices) ?? 0) * it.quantity;
  }
  return Math.round(sum * 100) / 100;
}

/** Cena z poprzedniego dnia w historii (ostatni punkt starszy niż data pliku cen). */
export function previousPrice(p: Printing, foil: boolean, prices: PriceFile, history: PriceHistory): number | null {
  if (p.cmProductId === null) return null;
  const today = prices.createdAt.slice(0, 10);
  const older = (history[p.cmProductId] ?? []).filter(([d]) => d < today);
  const last = older[older.length - 1];
  if (!last) return null;
  return foil ? last[2] ?? last[1] : last[1] ?? last[2];
}

/** Zmiana wartości kolekcji względem poprzedniego dnia; null, gdy brak historii. */
export function collectionChange(
  items: InventoryItem[], byId: Map<string, Printing>, prices: PriceFile, history: PriceHistory,
): number | null {
  let change = 0;
  let any = false;
  for (const it of items) {
    const p = byId.get(it.printingId);
    if (!p) continue;
    const now = priceOf(p, it.foil, prices);
    const prev = previousPrice(p, it.foil, prices, history);
    if (now === null || prev === null) continue;
    any = true;
    change += (now - prev) * it.quantity;
  }
  return any ? Math.round(change * 100) / 100 : null;
}

/** Punkty wykresu: z historii, gdy ma co najmniej 5 dni; inaczej ze średnich 30, 7, 1 dnia i trendu. */
export function sparklinePoints(history: HistoryPoint[], entry: PriceEntry | undefined, foil: boolean): number[] {
  const pick = (a: number | null, b: number | null) => (foil ? b ?? a : a ?? b);
  const fromHistory = history.map(([, t, tf]) => pick(t, tf)).filter((v): v is number => v !== null);
  if (fromHistory.length >= 5) return fromHistory;
  if (!entry) return [];
  return [
    pick(entry.avg30, entry.avg30Foil), pick(entry.avg7, entry.avg7Foil),
    pick(entry.avg1, entry.avg1Foil), pick(entry.trend, entry.trendFoil),
  ].filter((v): v is number => v !== null);
}

/** Czy plik cen jest starszy niż 48 godzin. */
export function isStale(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime() > 48 * 3600 * 1000;
}
