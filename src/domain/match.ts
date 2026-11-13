// Odcisk obrazu karty i dopasowanie do wzorców. Czyste funkcje, bez DOM.

export const FP_W = 24;
export const FP_H = 32;
export const FP_LEN = FP_W * FP_H;
/** Minimalne podobieństwo, żeby uznać rozpoznanie za pewne. Do strojenia na zdjęciach właściciela. */
export const MATCH_MIN = 0.8;
/** Minimalna przewaga nad drugą ilustracją. */
export const MATCH_MARGIN = 0.05;
/** Wydania o podobieństwie co najmniej takim mają wspólny artKey. */
export const SAME_ART = 0.97;

/** Margines, w którym inne ilustracje tej samej karty (np. promo z innym znaczkiem) traktujemy jako jej wydania. */
export const SAME_CARD_BAND = 0.08;

export interface ArtEntry { artKey: string; cardSlug: string; printingIds: string[] }
export interface FingerprintIndex { arts: ArtEntry[]; vectors: Float32Array[] }
export interface Candidate { artKey: string; printingIds: string[]; score: number }
export interface MatchResult { confident: boolean; candidates: Candidate[] }

/**
 * Odcisk wyprostowanej karty (proporcja 5:7): skala szarości, uśrednienie do 24×32,
 * odjęcie średniej i normalizacja do długości 1. Jednolity obraz daje wektor zerowy.
 */
export function fingerprint(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Float32Array {
  const sum = new Float64Array(FP_LEN);
  const cnt = new Uint32Array(FP_LEN);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(FP_H - 1, Math.floor((y * FP_H) / h));
    for (let x = 0; x < w; x++) {
      const fx = Math.min(FP_W - 1, Math.floor((x * FP_W) / w));
      const i = (y * w + x) * 4;
      sum[fy * FP_W + fx] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      cnt[fy * FP_W + fx]++;
    }
  }
  const out = new Float32Array(FP_LEN);
  let mean = 0;
  for (let i = 0; i < FP_LEN; i++) {
    out[i] = cnt[i] ? sum[i] / cnt[i] : 0;
    mean += out[i];
  }
  mean /= FP_LEN;
  let norm = 0;
  for (let i = 0; i < FP_LEN; i++) {
    out[i] -= mean;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-3 * FP_LEN) return new Float32Array(FP_LEN); // za mało kontrastu, by cokolwiek rozpoznać
  for (let i = 0; i < FP_LEN; i++) out[i] /= norm;
  return out;
}

export function similarity(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Ten sam odcisk dla karty obróconej o 180°. */
export function rotate180(fp: Float32Array): Float32Array {
  return Float32Array.from(fp).reverse();
}

/**
 * Do 3 kandydatów. Pierwszy łączy wszystkie bliskie ilustracje tej samej karty (różnią się tylko
 * znaczkiem lub ramką), więc ich rozróżnienie to wybór wydania, a nie niepewność.
 * `confident`, gdy najlepsza przekracza próg i wyraźnie wygrywa z najbliższą INNĄ kartą.
 */
export function matchCard(fp: Float32Array, index: FingerprintIndex): MatchResult {
  const flipped = rotate180(fp);
  const scored = index.arts.map((art, i) => ({
    art,
    score: Math.max(similarity(fp, index.vectors[i]), similarity(flipped, index.vectors[i])),
  }));
  scored.sort((a, b) => b.score - a.score);
  const first = scored[0];
  if (!first) return { confident: false, candidates: [] };
  const same = scored.filter((s) => s.art.cardSlug === first.art.cardSlug && first.score - s.score <= SAME_CARD_BAND);
  const rivals = scored.filter((s) => s.art.cardSlug !== first.art.cardSlug);
  const candidates: Candidate[] = [
    { artKey: first.art.artKey, printingIds: same.flatMap((s) => s.art.printingIds), score: first.score },
    ...rivals.slice(0, 2).map((s) => ({ artKey: s.art.artKey, printingIds: s.art.printingIds, score: s.score })),
  ];
  const confident = first.score >= MATCH_MIN && (!rivals[0] || first.score - rivals[0].score >= MATCH_MARGIN);
  return { confident, candidates };
}

/** Grupuje wydania o tej samej ilustracji. Zwraca mapę id wydania → artKey (id pierwszego w grupie). */
export function groupByArt(ids: string[], vectors: Float32Array[]): Record<string, string> {
  const parent = ids.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (similarity(vectors[i], vectors[j]) >= SAME_ART) parent[find(j)] = find(i);
    }
  }
  return Object.fromEntries(ids.map((id, i) => [id, ids[find(i)]]));
}

// Plik binarny: uint32 LE długość nagłówka, nagłówek JSON ({ arts }), potem Int8 (wartość × 127 / max).
export function encodeIndex(index: FingerprintIndex): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify({ arts: index.arts }));
  const out = new Uint8Array(4 + header.length + index.vectors.length * FP_LEN);
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  index.vectors.forEach((v, n) => {
    let max = 1e-9;
    for (const x of v) max = Math.max(max, Math.abs(x));
    for (let i = 0; i < FP_LEN; i++) out[4 + header.length + n * FP_LEN + i] = Math.round((v[i] / max) * 127) & 0xff;
  });
  return out;
}

export function decodeIndex(bytes: Uint8Array): FingerprintIndex {
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const { arts } = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLen))) as { arts: ArtEntry[] };
  const data = new Int8Array(bytes.buffer, bytes.byteOffset + 4 + headerLen, arts.length * FP_LEN);
  const vectors = arts.map((_, n) => {
    const v = new Float32Array(FP_LEN);
    let norm = 0;
    for (let i = 0; i < FP_LEN; i++) {
      v[i] = data[n * FP_LEN + i];
      norm += v[i] * v[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < FP_LEN; i++) v[i] /= norm;
    return v;
  });
  return { arts, vectors };
}

export async function loadFingerprintIndex(url: string): Promise<FingerprintIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wzorce kart: HTTP ${res.status}`);
  return decodeIndex(new Uint8Array(await res.arrayBuffer()));
}
