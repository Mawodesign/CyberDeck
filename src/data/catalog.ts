import { isStale } from '../domain/pricing';
import type { PriceFile, PriceHistory, Printing } from '../domain/types';

export interface Catalog {
  printings: Printing[];
  byId: Map<string, Printing>;
  /** Wydania tej samej karty (wspólny cardSlug). */
  bySlug: Map<string, Printing[]>;
  prices: PriceFile;
  history: PriceHistory;
  pricesStale: boolean;
}

const base = import.meta.env.BASE_URL;
export const assetUrl = (path: string) => `${base}${path}`;

async function getJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    const res = await fetch(assetUrl(path));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export async function loadCatalog(): Promise<Catalog> {
  const [printings, prices, history] = await Promise.all([
    getJson<Printing[]>('data/cards.json'),
    getJson<PriceFile>('data/prices.json', { createdAt: '', prices: {} }),
    getJson<PriceHistory>('data/price-history.json', {}),
  ]);
  const bySlug = new Map<string, Printing[]>();
  for (const p of printings) bySlug.set(p.cardSlug, [...(bySlug.get(p.cardSlug) ?? []), p]);
  return {
    printings,
    byId: new Map(printings.map((p) => [p.id, p])),
    bySlug,
    prices,
    history,
    pricesStale: prices.createdAt === '' || isStale(prices.createdAt),
  };
}
