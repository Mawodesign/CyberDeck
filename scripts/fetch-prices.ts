// Pobiera dzienny plik cen Cardmarket i dopisuje dzień do historii.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { PriceHistory } from '../src/domain/types';
import { appendHistory, CM_PRICES_URL, toPriceFile, type CmPriceGuide } from './lib/cardmarket';

const res = await fetch(CM_PRICES_URL);
if (!res.ok) throw new Error(`Cardmarket ceny: HTTP ${res.status}`);
const file = toPriceFile((await res.json()) as CmPriceGuide);
const historyPath = 'public/data/price-history.json';
const history: PriceHistory = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : {};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/prices.json', JSON.stringify(file));
writeFileSync(historyPath, JSON.stringify(appendHistory(history, file)));
console.log(`Ceny z ${file.createdAt}: ${Object.keys(file.prices).length} produktów`);
