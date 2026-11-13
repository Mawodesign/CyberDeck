// Pobiera oficjalną bazę kart, obrazki i (jeśli są dane Cardmarket) dopasowuje produkty.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { fetchOfficialCards, parseOfficialCards } from './lib/official';

const IMG_DIR = 'public/img';
export const IMG_WIDTH = 360;

async function downloadImages(remote: Record<string, string>): Promise<number> {
  mkdirSync(IMG_DIR, { recursive: true });
  const todo = Object.entries(remote).filter(([id]) => !existsSync(`${IMG_DIR}/${id}.webp`));
  let failed = 0;
  const worker = async () => {
    for (let job = todo.pop(); job; job = todo.pop()) {
      const [id, url] = job;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await sharp(buf).resize({ width: IMG_WIDTH }).webp({ quality: 78 }).toFile(`${IMG_DIR}/${id}.webp`);
      } catch (e) {
        failed++;
        console.warn(`Obrazek ${id}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return failed;
}

const { printings, remoteImages } = parseOfficialCards(await fetchOfficialCards());
if (printings.length < 300) throw new Error(`Za mało wydań: ${printings.length}`);
const failed = await downloadImages(remoteImages);

// Uzupełnienia z późniejszych kroków budowy (zadania 2 i 6), jeśli ich pliki istnieją.
const { applyCardmarket } = await import('./lib/cardmarket');
const withCm = await applyCardmarket(printings);
const artKeysPath = 'public/data/art-keys.json';
if (existsSync(artKeysPath)) {
  const keys = JSON.parse(readFileSync(artKeysPath, 'utf8')) as Record<string, string>;
  for (const p of withCm) p.artKey = keys[p.id] ?? p.id;
}

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/cards.json', JSON.stringify(withCm));
console.log(`Zapisano ${withCm.length} wydań; obrazki z błędem: ${failed}`);
