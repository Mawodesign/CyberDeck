import { expect, test } from 'vitest';
import type { Printing } from '../../src/domain/types';
import { appendHistory, mapExpansions, matchPrintings, normalizeName, toPriceFile } from './cardmarket';

const pr = (id: string, name: string, setCode: string, collectorNumber: string): Printing => ({
  id, cardSlug: name, name, set: setCode, setCode, collectorNumber, rarity: 'Common', finish: '',
  imageUrl: '', artKey: id, cmProductId: null,
});

test('normalizuje nazwy', () => {
  expect(normalizeName('Adam Smasher — Ender of Legends')).toBe(normalizeName('Adam Smasher - Ender of Legends'));
  expect(normalizeName('El Sombrerón')).toBe('el sombreron');
});

test('mapuje rozszerzenia po nazwach, beta przed retail przy remisie', () => {
  const printings = [pr('a', 'X', 'setbeta', '001'), pr('b', 'X', 'setretail', '001'), pr('c', 'Y', 'promo', '001')];
  const products = [
    { idProduct: 1, name: 'X', idExpansion: 10 }, { idProduct: 9, name: 'X', idExpansion: 20 },
    { idProduct: 5, name: 'Y', idExpansion: 30 },
  ];
  expect(mapExpansions(printings, products)).toEqual({ 10: 'setbeta', 20: 'setretail', 30: 'promo' });
});

test('dopasowuje po nazwie i rozszerzeniu, kolejność numerów = kolejność idProduct', () => {
  const printings = [pr('reg', 'Adam Smasher — Ender of Legends', 's', '001'), pr('ico', 'Adam Smasher — Ender of Legends', 's', '141'), pr('other', 'V', 's', '002')];
  const products = [
    { idProduct: 229, name: 'Adam Smasher - Ender of Legends', idExpansion: 1 },
    { idProduct: 88, name: 'Adam Smasher - Ender of Legends', idExpansion: 1 },
    { idProduct: 90, name: 'V', idExpansion: 1 },
  ];
  const { matched, unmatched } = matchPrintings(printings, products, {}, { 1: 's' });
  const by = Object.fromEntries(matched.map((p) => [p.id, p.cmProductId]));
  expect(by).toEqual({ reg: 88, ico: 229, other: 90 });
  expect(unmatched).toHaveLength(0);
});

test('override wygrywa, a różna liczba wydań i produktów zostaje niedopasowana', () => {
  const printings = [pr('a', 'X', 's', '001'), pr('b', 'X', 's', '002'), pr('c', 'Z', 's', '003')];
  const products = [{ idProduct: 1, name: 'X', idExpansion: 1 }, { idProduct: 7, name: 'Z', idExpansion: 1 }];
  const { matched, unmatched } = matchPrintings(printings, products, { c: 999 }, { 1: 's' });
  expect(matched.find((p) => p.id === 'c')!.cmProductId).toBe(999);
  expect(unmatched.map((p) => p.id).sort()).toEqual(['a', 'b']);
  expect(unmatched.every((p) => p.cmProductId === null)).toBe(true);
});

test('toPriceFile zamienia 0 na null i mapuje pola -foil', () => {
  const f = toPriceFile({ createdAt: '2026-11-13T02:44:35+0100', priceGuides: [{ idProduct: 904772, trend: 0, low: 98.99, 'trend-foil': 58.97 }] });
  expect(f.createdAt).toBe('2026-11-13T02:44:35+0100');
  expect(f.prices[904772].trend).toBeNull();
  expect(f.prices[904772].low).toBe(98.99);
  expect(f.prices[904772].trendFoil).toBe(58.97);
  expect(f.prices[904772].avg30Foil).toBeNull();
});

test('appendHistory nie dubluje tego samego dnia i trzyma najwyżej 90 dni', () => {
  const file = (d: string, t: number) => toPriceFile({ createdAt: `${d}T02:00:00+0100`, priceGuides: [{ idProduct: 1, trend: t }] });
  let h = appendHistory({}, file('2026-11-12', 1));
  h = appendHistory(h, file('2026-11-13', 2));
  h = appendHistory(h, file('2026-11-13', 3));
  expect(h[1]).toEqual([['2026-11-12', 1, null], ['2026-11-13', 3, null]]);
  for (let i = 0; i < 100; i++) h = appendHistory(h, file(new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10), i));
  expect(h[1]).toHaveLength(90);
});
