import { expect, test } from 'vitest';
import {
  collectionChange, collectionValue, formatEur, isFoilOnly, isStale, priceOf, sparklinePoints,
} from './pricing';
import type { InventoryItem, PriceEntry, PriceFile, Printing } from './types';

const entry = (o: Partial<PriceEntry>): PriceEntry => ({
  trend: null, low: null, avg1: null, avg7: null, avg30: null,
  trendFoil: null, lowFoil: null, avg1Foil: null, avg7Foil: null, avg30Foil: null, ...o,
});
const pr = (id: string, cm: number | null): Printing => ({
  id, cardSlug: id, name: id, set: 's', setCode: 's', collectorNumber: '001', rarity: 'Common',
  finish: '', imageUrl: '', artKey: id, cmProductId: cm,
});
const prices: PriceFile = {
  createdAt: '2026-11-13T02:44:35+0100',
  prices: { 1: entry({ trend: 2, trendFoil: 10 }), 2: entry({ trendFoil: 65.72 }), 3: entry({ trend: 0.07 }), 4: entry({}) },
};
const item = (printingId: string, foil: boolean, quantity: number): InventoryItem => ({
  id: printingId + foil, printingId, foil, quantity, addedAt: '2026-11-13',
});

test('formatEur', () => {
  expect(formatEur(84.9)).toBe('84,90 €');
  expect(formatEur(0.07)).toBe('0,07 €');
  expect(formatEur(null)).toBe('brak ceny');
});

test('priceOf: foil i zwykła, z przejściem na jedyne dostępne pole', () => {
  expect(priceOf(pr('a', 1), false, prices)).toBe(2);
  expect(priceOf(pr('a', 1), true, prices)).toBe(10);
  expect(priceOf(pr('b', 2), false, prices)).toBe(65.72);
  expect(priceOf(pr('c', 3), true, prices)).toBe(0.07);
});

test('priceOf: null bez produktu Cardmarket, bez wpisu i bez trendu', () => {
  expect(priceOf(pr('x', null), false, prices)).toBeNull();
  expect(priceOf(pr('x', 999), false, prices)).toBeNull();
  expect(priceOf(pr('x', 4), true, prices)).toBeNull();
});

test('isFoilOnly', () => {
  expect(isFoilOnly(pr('b', 2), prices)).toBe(true);
  expect(isFoilOnly(pr('a', 1), prices)).toBe(false);
  expect(isFoilOnly(pr('x', null), prices)).toBe(false);
});

test('collectionValue mnoży przez ilość i liczy brak ceny jako 0', () => {
  const byId = new Map([pr('a', 1), pr('b', 2), pr('n', null)].map((p) => [p.id, p]));
  const items = [item('a', false, 3), item('b', true, 1), item('n', false, 5), item('usunieta', false, 2)];
  expect(collectionValue(items, byId, prices)).toBe(71.72);
});

test('collectionChange względem poprzedniego dnia', () => {
  const byId = new Map([pr('a', 1)].map((p) => [p.id, p]));
  const history = { 1: [['2026-11-12', 1.5, 9], ['2026-11-13', 2, 10]] as [string, number, number][] };
  expect(collectionChange([item('a', false, 2)], byId, prices, history)).toBe(1);
  expect(collectionChange([item('a', false, 2)], byId, prices, {})).toBeNull();
});

test('sparklinePoints: z historii od 5 punktów, inaczej ze średnich', () => {
  const h = [1, 2, 3, 4, 5].map((v, i) => [`2026-11-0${i + 1}`, v, null] as [string, number, null]);
  expect(sparklinePoints(h, entry({ trend: 9 }), false)).toEqual([1, 2, 3, 4, 5]);
  expect(sparklinePoints(h.slice(0, 2), entry({ avg30: 3, avg7: null, avg1: 2, trend: 1 }), false)).toEqual([3, 2, 1]);
  expect(sparklinePoints([], entry({ avg30Foil: 113.51, avg7Foil: 100.86, avg1Foil: 96.99, trendFoil: 58.97 }), true))
    .toEqual([113.51, 100.86, 96.99, 58.97]);
  expect(sparklinePoints([], undefined, false)).toEqual([]);
});

test('isStale po 48 godzinach', () => {
  expect(isStale('2026-11-13T02:44:35+0100', new Date('2026-11-14T12:00:00Z'))).toBe(false);
  expect(isStale('2026-11-13T02:44:35+0100', new Date('2026-11-15T02:00:00Z'))).toBe(true);
});
