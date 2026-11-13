// Format wymiany gradingu, wspólny dla aplikacji i stacji na komputerze.
import type { GradeResult } from './types';

export const PHOTO_SLOTS = ['front', 'back', 'corner-tl', 'corner-tr', 'corner-br', 'corner-bl'] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];

export const SLOT_LABELS: Record<PhotoSlot, string> = {
  front: 'Przód',
  back: 'Tył',
  'corner-tl': 'Róg lewy górny',
  'corner-tr': 'Róg prawy górny',
  'corner-br': 'Róg prawy dolny',
  'corner-bl': 'Róg lewy dolny',
};

export interface GradingRequest {
  id: string;
  printingId: string;
  name: string;
  set: string;
  collectorNumber: string;
  foil: boolean;
  createdAt: string;
  photos: string[];
}

export const REQUEST_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
export const isRequestId = (s: unknown): s is string => typeof s === 'string' && REQUEST_ID.test(s);
export const isPhotoSlot = (s: unknown): s is PhotoSlot => PHOTO_SLOTS.includes(s as PhotoSlot);

const SCORES = ['overall', 'centering', 'corners', 'edges', 'surface'] as const;

/** Sprawdza wynik zapisany w grading/results/<id>.json. Rzuca błąd przy brakach lub ocenach spoza 1–10. */
export function parseGradeResult(json: unknown): GradeResult {
  const o = json as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('Wynik gradingu: to nie jest obiekt');
  for (const k of SCORES) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 10) {
      throw new Error(`Wynik gradingu: pole ${k} musi być liczbą od 1 do 10`);
    }
  }
  if (typeof o.notes !== 'string') throw new Error('Wynik gradingu: brak pola notes');
  return {
    overall: o.overall as number, centering: o.centering as number, corners: o.corners as number,
    edges: o.edges as number, surface: o.surface as number, notes: o.notes,
    gradedAt: typeof o.gradedAt === 'string' ? o.gradedAt : new Date().toISOString(),
  };
}
