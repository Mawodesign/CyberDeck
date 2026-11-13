// Liczy odciski obrazków wszystkich wydań, grupuje te same ilustracje i zapisuje indeks dla skanera.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { encodeIndex, fingerprint, groupByArt } from '../src/domain/match';
import type { Printing } from '../src/domain/types';

const cardsPath = 'public/data/cards.json';
const printings = JSON.parse(readFileSync(cardsPath, 'utf8')) as Printing[];
const withImage = printings.filter((p) => existsSync(`public/${p.imageUrl}`));

const vectors: Float32Array[] = [];
for (const p of withImage) {
  const { data, info } = await sharp(`public/${p.imageUrl}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  vectors.push(fingerprint(data, info.width, info.height));
}

const ids = withImage.map((p) => p.id);
const keys = groupByArt(ids, vectors);
const artKeys = [...new Set(Object.values(keys))];
const index = {
  arts: artKeys.map((artKey) => ({
    artKey,
    cardSlug: withImage[ids.indexOf(artKey)].cardSlug,
    printingIds: ids.filter((id) => keys[id] === artKey),
  })),
  vectors: artKeys.map((k) => vectors[ids.indexOf(k)]),
};

writeFileSync('public/data/fingerprints.bin', encodeIndex(index));
writeFileSync('public/data/art-keys.json', JSON.stringify(keys));
for (const p of printings) p.artKey = keys[p.id] ?? p.id;
writeFileSync(cardsPath, JSON.stringify(printings));
console.log(`Odciski: ${withImage.length} wydań w ${artKeys.length} grupach ilustracji (bez obrazka: ${printings.length - withImage.length})`);
