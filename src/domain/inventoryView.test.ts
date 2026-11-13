import { expect, test } from 'vitest';
import { fold, inventoryRows, matchesQuery } from './inventoryView';
import type { InventoryItem, PriceEntry, PriceFile, Printing, Rarity } from './types';

const entry = (trend: number | null): PriceEntry => ({
  trend, low: null, avg1: null, avg7: null, avg30: null,
  trendFoil: null, lowFoil: null, avg1Foil: null, avg7Foil: null, avg30Foil: null,
});
const pr = (id: string, name: string, rarity: Rarity, num: string, cm: number | null): Printing => ({
  id, cardSlug: id, name, set: 'S', setCode: 's', collectorNumber: num, rarity, finish: '', imageUrl: '', artKey: id, cmProductId: cm,
});
const printings = [
  pr('a', 'Adam Smasher — Ender of Legends', 'Iconic Legend', '141', 1),
  pr('b', 'El Sombrerón — La Venganza Lenta', 'Common', '010', 2),
  pr('c', 'Goro Takemura — Hands Unclean', 'Rare', '055', null),
];
const byId = new Map(printings.map((p) => [p.id, p]));
const prices: PriceFile = { createdAt: '2026-11-13T02:44:35+0100', prices: { 1: entry(65.72), 2: entry(0.07) } };
const items: InventoryItem[] = ['b', 'c', 'a', 'nieznana'].map((id) => ({ id, printingId: id, foil: false, quantity: 1, addedAt: '' }));
const ids = (sort: 'price' | 'rarity' | 'number', q = '') => inventoryRows(items, byId, prices, sort, q).map((r) => r.printing.id);

test('sortuje po cenie malejąco, brak ceny na końcu', () => expect(ids('price')).toEqual(['a', 'b', 'c']));
test('sortuje po rarity od najrzadszej', () => expect(ids('rarity')).toEqual(['a', 'c', 'b']));
test('sortuje po numerze rosnąco', () => expect(ids('number')).toEqual(['b', 'c', 'a']));
test('pomija pozycje kart spoza bazy', () => expect(ids('price')).not.toContain('nieznana'));

test('wyszukiwanie ignoruje wielkość liter i znaki diakrytyczne', () => {
  expect(ids('price', 'sombreron')).toEqual(['b']);
  expect(ids('price', 'SMASHER')).toEqual(['a']);
  expect(ids('price', '  ')).toHaveLength(3);
  expect(matchesQuery(printings[0], 'xyz')).toBe(false);
  expect(fold('Żółć')).toBe('zolc');
});
