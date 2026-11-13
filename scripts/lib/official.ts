import { RARITY_ORDER, type Printing, type Rarity } from '../../src/domain/types';

export const OFFICIAL_API = 'https://api.netdeck.gg/api/cards/cyberpunk';

interface ApiPrinting {
  id: string; collector_number: string; image_url: string | null;
  set: { code: string; name: string }; rarity: string; finish: string | null; language: string;
}
interface ApiCard { slug: string; canonical_name: string; printings: ApiPrinting[] }

export interface ParsedCards { printings: Printing[]; remoteImages: Record<string, string> }

/** Zamienia karty z oficjalnego API na płaską listę angielskich wydań. */
export function parseOfficialCards(items: ApiCard[]): ParsedCards {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Oficjalna baza: brak kart w odpowiedzi');
  const printings: Printing[] = [];
  const remoteImages: Record<string, string> = {};
  const seen = new Set<string>();
  for (const card of items) {
    for (const p of card.printings ?? []) {
      if (p.language !== 'en' || seen.has(p.id)) continue;
      if (!RARITY_ORDER.includes(p.rarity as Rarity)) {
        throw new Error(`Oficjalna baza: nieznane rarity "${p.rarity}" (${card.slug})`);
      }
      seen.add(p.id);
      printings.push({
        id: p.id,
        cardSlug: card.slug,
        name: card.canonical_name,
        set: p.set.name,
        setCode: p.set.code,
        collectorNumber: p.collector_number,
        rarity: p.rarity as Rarity,
        finish: p.finish ?? '',
        imageUrl: `img/${p.id}.webp`,
        artKey: p.id,
        cmProductId: null,
      });
      if (p.image_url) remoteImages[p.id] = p.image_url;
    }
  }
  if (printings.length === 0) throw new Error('Oficjalna baza: brak kart w odpowiedzi');
  return { printings, remoteImages };
}

export async function fetchOfficialCards(): Promise<ApiCard[]> {
  const items: ApiCard[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`${OFFICIAL_API}?limit=100&offset=${offset}`);
    if (!res.ok) throw new Error(`Oficjalna baza: HTTP ${res.status}`);
    const page = (await res.json()) as { items: ApiCard[]; total: number };
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) break;
  }
  return items;
}
