// Śledzenie kart między klatkami: etykieta pojawia się dopiero po kilku zgodnych rozpoznaniach.
import type { MatchResult } from '../domain/match';
import { quadCenter, type Quad } from './geometry';

export const STABLE_FRAMES = 3;
/** Po tylu klatkach bez pewnego rozpoznania karta dostaje status „Wybierz”. */
export const UNSURE_FRAMES = 5;
export const TRACK_TTL_MS = 1200;

export interface Detection { quad: Quad; match: MatchResult }

export interface Track {
  id: number;
  quad: Quad;
  match: MatchResult;
  /** Ilustracja z bieżącej serii zgodnych rozpoznań. */
  artKey: string | null;
  streak: number;
  seen: number;
  /** 'pending' – jeszcze nie wiadomo; 'sure' – rozpoznana; 'unsure' – trzeba wybrać z kandydatów. */
  state: 'pending' | 'sure' | 'unsure';
  /** Wydanie wybrane ręcznie przez użytkownika. */
  chosenPrintingId: string | null;
  added: boolean;
  lastSeen: number;
}

let nextId = 1;

export function updateTracks(
  prev: Track[], detections: Detection[], now: number, frameWidth: number, instant = false,
): Track[] {
  const used = new Set<number>();
  const out: Track[] = [];
  for (const det of detections) {
    const c = quadCenter(det.quad);
    let best: Track | null = null;
    let bestD = 0.15 * frameWidth;
    for (const t of prev) {
      if (used.has(t.id)) continue;
      const tc = quadCenter(t.quad);
      const d = Math.hypot(tc.x - c.x, tc.y - c.y);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    const top = det.match.confident ? det.match.candidates[0].artKey : null;
    const base: Track = best ?? {
      id: nextId++, quad: det.quad, match: det.match, artKey: null, streak: 0, seen: 0,
      state: 'pending', chosenPrintingId: null, added: false, lastSeen: now,
    };
    if (best) used.add(best.id);
    const t: Track = { ...base, quad: det.quad, lastSeen: now, seen: base.seen + 1 };
    if (t.state !== 'sure' && !t.chosenPrintingId) {
      t.streak = top !== null && top === base.artKey ? base.streak + 1 : top !== null ? 1 : 0;
      t.artKey = top;
      t.match = det.match;
      if (top !== null && (instant || t.streak >= STABLE_FRAMES)) t.state = 'sure';
      else if (top === null && (instant || t.seen >= UNSURE_FRAMES)) t.state = 'unsure';
      else if (top !== null && t.state === 'unsure') t.state = 'pending';
    }
    out.push(t);
  }
  for (const t of prev) {
    if (!used.has(t.id) && now - t.lastSeen < TRACK_TTL_MS) out.push(t);
  }
  return out;
}

/**
 * Wybiera wydanie dla rozpoznanej ilustracji: jedyne, albo jedyne z ostatnio wybranego zestawu.
 * Zwraca null, gdy użytkownik musi wybrać sam.
 */
export function resolvePrinting(
  printingIds: string[], setOf: (id: string) => string | undefined, preferredSet: string | null,
): string | null {
  if (printingIds.length === 1) return printingIds[0];
  if (!preferredSet) return null;
  const inSet = printingIds.filter((id) => setOf(id) === preferredSet);
  return inSet.length === 1 ? inSet[0] : null;
}
