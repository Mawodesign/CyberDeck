import { existsSync, readFileSync } from 'node:fs';
import type { PriceEntry, PriceFile, PriceHistory, Printing } from '../../src/domain/types';

export const CM_GAME_ID = 23;
const CM_BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
export const CM_SINGLES_URL = `${CM_BASE}/productList/products_singles_${CM_GAME_ID}.json`;
export const CM_PRICES_URL = `${CM_BASE}/priceGuide/price_guide_${CM_GAME_ID}.json`;
export const HISTORY_DAYS = 90;

export interface CmProduct { idProduct: number; name: string; idExpansion: number }
export interface CmPriceGuide { createdAt: string; priceGuides: Array<Record<string, number | null>> }

export function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const numOf = (collector: string): [number, string] => [parseInt(collector.replace(/\D/g, ''), 10) || 0, collector];
const byCollector = (a: Printing, b: Printing) => {
  const [na, sa] = numOf(a.collectorNumber);
  const [nb, sb] = numOf(b.collectorNumber);
  return na - nb || sa.localeCompare(sb);
};

function countNames<T>(items: T[], name: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = normalizeName(name(it));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Przypisuje każdemu rozszerzeniu Cardmarket kod zestawu z oficjalnej bazy na podstawie wspólnych nazw. */
export function mapExpansions(printings: Printing[], products: CmProduct[]): Record<number, string> {
  const sets = new Map<string, Printing[]>();
  for (const p of printings) sets.set(p.setCode, [...(sets.get(p.setCode) ?? []), p]);
  const setNames = new Map([...sets].map(([code, ps]) => [code, countNames(ps, (p) => p.name)] as const));
  const exps = new Map<number, CmProduct[]>();
  for (const p of products) exps.set(p.idExpansion, [...(exps.get(p.idExpansion) ?? []), p]);

  // Wszystkie pary (rozszerzenie, zestaw) od najlepiej pasującej; przy remisie starsze
  // rozszerzenie dostaje zestaw beta (Beta wyszła przed Retail).
  const pairs: Array<{ idExp: number; code: string; score: number }> = [];
  for (const [idExp, prods] of exps) {
    const names = countNames(prods, (p) => p.name);
    for (const [code, sn] of setNames) {
      let overlap = 0;
      for (const [n, c] of names) overlap += Math.min(c, sn.get(n) ?? 0);
      const score = overlap / Math.max(prods.length, sets.get(code)!.length);
      if (score > 0) pairs.push({ idExp, code, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.idExp - b.idExp
    || Number(b.code.includes('beta')) - Number(a.code.includes('beta')) || a.code.localeCompare(b.code));
  const result: Record<number, string> = {};
  const taken = new Set<string>();
  for (const { idExp, code } of pairs) {
    if (idExp in result || taken.has(code)) continue;
    result[idExp] = code;
    taken.add(code);
  }
  return result;
}

export function matchPrintings(
  printings: Printing[], products: CmProduct[], overrides: Record<string, number>, expansionMap: Record<number, string>,
): { matched: Printing[]; unmatched: Printing[] } {
  const prodGroups = new Map<string, CmProduct[]>();
  for (const p of products) {
    const code = expansionMap[p.idExpansion];
    if (!code) continue;
    const k = `${code}|${normalizeName(p.name)}`;
    prodGroups.set(k, [...(prodGroups.get(k) ?? []), p]);
  }
  const printGroups = new Map<string, Printing[]>();
  for (const p of printings) {
    const k = `${p.setCode}|${normalizeName(p.name)}`;
    printGroups.set(k, [...(printGroups.get(k) ?? []), p]);
  }
  const ids = new Map<string, number>();
  for (const [k, group] of printGroups) {
    const prods = (prodGroups.get(k) ?? []).slice().sort((a, b) => a.idProduct - b.idProduct);
    if (prods.length !== group.length) continue; // niepewne: lepiej brak ceny niż zła cena
    group.slice().sort(byCollector).forEach((p, i) => ids.set(p.id, prods[i].idProduct));
  }
  const out = printings.map((p) => ({ ...p, cmProductId: overrides[p.id] ?? ids.get(p.id) ?? null }));
  return { matched: out.filter((p) => p.cmProductId !== null), unmatched: out.filter((p) => p.cmProductId === null) };
}

const val = (v: number | null | undefined): number | null => (typeof v === 'number' && v > 0 ? v : null);

export function toPriceFile(raw: CmPriceGuide): PriceFile {
  const prices: Record<number, PriceEntry> = {};
  for (const g of raw.priceGuides) {
    prices[g.idProduct as number] = {
      trend: val(g.trend), low: val(g.low), avg1: val(g.avg1), avg7: val(g.avg7), avg30: val(g.avg30),
      trendFoil: val(g['trend-foil']), lowFoil: val(g['low-foil']), avg1Foil: val(g['avg1-foil']),
      avg7Foil: val(g['avg7-foil']), avg30Foil: val(g['avg30-foil']),
    };
  }
  return { createdAt: raw.createdAt, prices };
}

export function appendHistory(history: PriceHistory, file: PriceFile): PriceHistory {
  const date = file.createdAt.slice(0, 10);
  const out: PriceHistory = { ...history };
  for (const [id, e] of Object.entries(file.prices)) {
    const pts = (out[+id] ?? []).filter(([d]) => d !== date);
    pts.push([date, e.trend, e.trendFoil]);
    out[+id] = pts.slice(-HISTORY_DAYS);
  }
  return out;
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

/** Pobiera katalog Cardmarket i uzupełnia cmProductId; wypisuje raport dopasowania. */
export async function applyCardmarket(printings: Printing[]): Promise<Printing[]> {
  const res = await fetch(CM_SINGLES_URL);
  if (!res.ok) throw new Error(`Cardmarket katalog: HTTP ${res.status}`);
  const products = ((await res.json()) as { products: CmProduct[] }).products;
  const overrides = readJson<Record<string, number>>('scripts/data/cm-overrides.json', {});
  const expansionMap = {
    ...mapExpansions(printings, products),
    ...readJson<Record<number, string>>('scripts/data/cm-expansions.json', {}),
  };
  const { matched, unmatched } = matchPrintings(printings, products, overrides, expansionMap);
  console.log('Rozszerzenia Cardmarket → zestawy:', expansionMap);
  console.log(`Cardmarket: dopasowano ${matched.length} z ${printings.length} wydań (produktów: ${products.length})`);
  const bySet: Record<string, number> = {};
  for (const p of unmatched) bySet[p.setCode] = (bySet[p.setCode] ?? 0) + 1;
  console.log('Niedopasowane wg zestawu:', bySet);
  const order = new Map(printings.map((p, i) => [p.id, i]));
  return [...matched, ...unmatched].sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
