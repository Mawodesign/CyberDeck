import sharp from 'sharp';
import { beforeAll, expect, test } from 'vitest';
import {
  decodeIndex, encodeIndex, fingerprint, FP_LEN, groupByArt, matchCard, rotate180, similarity,
  type FingerprintIndex,
} from './match';

const DIR = 'scripts/fixtures/img';
const FILES = ['smasher-retail-001', 'smasher-beta-001', 'smasher-retail-141', 'other'];

async function fp(file: string, mod?: (s: sharp.Sharp) => sharp.Sharp): Promise<Float32Array> {
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
    artKey, printingIds: FILES.filter((f) => keys[f] === artKey),
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
    arts: Array.from({ length: 10 }, (_, i) => ({ artKey: `a${i}`, printingIds: [`a${i}`] })),
    vectors: Array.from({ length: 10 }, () => index.vectors[0]),
  };
  expect(matchCard(index.vectors[0], many).candidates).toHaveLength(3);
});

test('zapis i odczyt indeksu zachowuje dopasowania', () => {
  const back = decodeIndex(encodeIndex(index));
  expect(back.arts).toEqual(index.arts);
  expect(back.vectors[0]).toHaveLength(FP_LEN);
  expect(similarity(back.vectors[1], index.vectors[1])).toBeGreaterThan(0.99);
});
