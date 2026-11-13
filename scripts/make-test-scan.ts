// Tworzy sztuczne „zdjęcie stołu” z trzema kartami do ręcznego sprawdzenia skanera (opcja „Ze zdjęcia”).
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import type { Printing } from '../src/domain/types';

const cards = JSON.parse(readFileSync('public/data/cards.json', 'utf8')) as Printing[];
const pick = (slug: string, set: string, n: string) => cards.find((c) => c.cardSlug === slug && c.setCode === set && c.collectorNumber === n)!;
const chosen = [
  { p: pick('adam-smasher-ender-of-legends', 'welcometonightcityretail', '141'), left: 60, top: 70, angle: -7 },
  { p: cards.find((c) => c.cardSlug === 'v-streetkid' && c.setCode === 'welcometonightcityretail')!, left: 470, top: 40, angle: 5 },
  { p: cards.find((c) => c.rarity === 'Common' && c.setCode === 'welcometonightcityretail')!, left: 840, top: 110, angle: 93 },
];
const W = 1400, H = 800;
const noise = Buffer.alloc(W * H * 3);
for (let i = 0; i < noise.length; i += 3) {
  const n = Math.random() * 18;
  noise[i] = 150 + n; noise[i + 1] = 118 + n; noise[i + 2] = 86 + n;
}
const layers = await Promise.all(chosen.map(async ({ p, left, top, angle }) => ({
  input: await sharp(`public/${p.imageUrl}`).resize(300, 420).modulate({ brightness: 0.92 })
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
  left, top,
})));
await sharp(noise, { raw: { width: W, height: H, channels: 3 } }).blur(1.2).composite(layers).blur(0.6).jpeg({ quality: 80 }).toFile('public/test-scan.jpg');
console.log(chosen.map((c) => `${c.p.name} (${c.p.setCode} ${c.p.collectorNumber})`).join('\n'));
