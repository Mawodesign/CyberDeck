import sharp, { type Sharp } from 'sharp';
import { beforeAll, expect, test } from 'vitest';
import {
  decodeIndex, encodeIndex, fingerprint, FP_LEN, groupByArt, matchCard, rotate180, similarity,
  type FingerprintIndex,
} from './match';

const DIR = 'scripts/fixtures/img';
const FILES = ['smasher-retail-001', 'smasher-beta-001', 'smasher-retail-141', 'other'];

async function fp(file: string, mod?: (s: Sharp) => Sharp): Promise<Float32Array> {
  let img = sharp(`${DIR}/${file}.webp`);
  if (mod) img = mod(img);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return fingerprint(data, info.width, info.height);
}

let index: FingerprintIndex;
beforeAll(async () => {
  const vectors = await Promise.all(FILES.map((f) => fp(f)));
  const keys = groupByArt(FILES, vectors);
  const arts = [...new Set(Object.values(keys))].map((artKey) => ({
    artKey, cardSlug: artKey.startsWith('smasher') ? 'smasher' : artKey, printingIds: FILES.filter((f) => keys[f] === artKey),
  }));
  index = { arts, vectors: arts.map((a) => vectors[FILES.indexOf(a.artKey)]) };
});

test('dwa wydania tej samej ilustracji mają wspólny artKey', () => {
  expect(index.arts).toHaveLength(3);
  expect(index.arts[0].printingIds).toEqual(['smasher-retail-001', 'smasher-beta-001']);
});

test('pomniejszony i rozjaśniony obraz dopasowuje się pewnie do swojej ilustracji', async () => {
  const probe = await fp('smasher-retail-141', (s) => s.resize(150).modulate({ brightness: 1.2 }));
  const r = matchCard(probe, index);
  expect(r.confident).toBe(true);
  expect(r.candidates[0].artKey).toBe('smasher-retail-141');
});

test('ilustracja w kilku wydaniach daje jednego kandydata z listą wydań', async () => {
  const r = matchCard(await fp('smasher-beta-001'), index);
  expect(r.confident).toBe(true);
  expect(r.candidates[0].printingIds).toEqual(['smasher-retail-001', 'smasher-beta-001']);
});

test('karta do góry nogami też się dopasowuje', async () => {
  const r = matchCard(rotate180(await fp('other')), index);
  expect(r.confident).toBe(true);
  expect(r.candidates[0].artKey).toBe('other');
});

test('jednolicie szary obraz nie jest pewnym rozpoznaniem', () => {
  const gray = new Uint8ClampedArray(100 * 140 * 4).fill(128);
  const r = matchCard(fingerprint(gray, 100, 140), index);
  expect(r.confident).toBe(false);
});

test('nigdy więcej niż 3 kandydatów', async () => {
  const many: FingerprintIndex = {
    arts: Array.from({ length: 10 }, (_, i) => ({ artKey: `a${i}`, cardSlug: `c${i}`, printingIds: [`a${i}`] })),
    vectors: Array.from({ length: 10 }, () => index.vectors[0]),
  };
  expect(matchCard(index.vectors[0], many).candidates).toHaveLength(3);
});

test('bliskie ilustracje tej samej karty to wybór wydania, a innej karty to niepewność', () => {
  const v = index.vectors[0];
  const bumped = Float32Array.from(v, (x, i) => x + (i % 7 === 0 ? 0.004 : 0));
  const len = Math.hypot(...bumped);
  const near = bumped.map((x) => x / len); // prawie ta sama ilustracja, znormalizowana jak wzorce
  const sameCard: FingerprintIndex = {
    arts: [
      { artKey: 'retail', cardSlug: 'smasher', printingIds: ['retail'] },
      { artKey: 'promo', cardSlug: 'smasher', printingIds: ['promo'] },
    ],
    vectors: [v, near],
  };
  const r = matchCard(v, sameCard);
  expect(r.confident).toBe(true);
  expect(r.candidates[0].printingIds).toEqual(['retail', 'promo']);

  const otherCard: FingerprintIndex = {
    ...sameCard,
    arts: [sameCard.arts[0], { artKey: 'x', cardSlug: 'inna', printingIds: ['x'] }],
  };
  const r2 = matchCard(v, otherCard);
  expect(r2.confident).toBe(false);
  expect(r2.candidates.map((c) => c.artKey)).toEqual(['retail', 'x']);
});

test('zapis i odczyt indeksu zachowuje dopasowania', () => {
  const back = decodeIndex(encodeIndex(index));
  expect(back.arts).toEqual(index.arts);
  expect(back.vectors[0]).toHaveLength(FP_LEN);
  expect(similarity(back.vectors[1], index.vectors[1])).toBeGreaterThan(0.99);
});
