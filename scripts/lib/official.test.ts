import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseOfficialCards } from './official';

const sample = JSON.parse(readFileSync('scripts/fixtures/cards-sample.json', 'utf8'));

test('parsuje angielskie wydania z odpowiedzi API', () => {
  const { printings, remoteImages } = parseOfficialCards(sample.items);
  expect(printings.length).toBeGreaterThanOrEqual(3);
  const smasher = printings.filter((x) => x.cardSlug === 'adam-smasher-ender-of-legends');
  expect(smasher).toHaveLength(8); // 11 wydań minus 3 francuskie
  expect(smasher[0].name).toBe('Adam Smasher — Ender of Legends');
  const beta = smasher.find((x) => x.setCode === 'welcometonightcitybeta' && x.collectorNumber === 'β141')!;
  expect(beta.rarity).toBe('Iconic Legend');
  expect(beta.imageUrl).toBe(`img/${beta.id}.webp`);
  expect(remoteImages[beta.id]).toMatch(/^https:\/\//);
  expect(beta.cmProductId).toBeNull();
  expect(beta.artKey).toBe(beta.id);
  expect(new Set(printings.map((x) => x.id)).size).toBe(printings.length);
});

test('rzuca błąd, gdy odpowiedź nie zawiera kart', () => {
  expect(() => parseOfficialCards([])).toThrow(/brak kart/);
});

test('rzuca błąd przy nieznanym rarity', () => {
  const bad = structuredClone(sample.items.slice(0, 1));
  bad[0].printings[0].rarity = 'Mythic';
  expect(() => parseOfficialCards(bad)).toThrow(/rarity/);
});
