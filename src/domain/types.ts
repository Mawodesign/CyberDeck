export type Rarity =
  | 'Common' | 'Uncommon' | 'Rare' | 'Nova Rare' | 'Epic' | 'Secret'
  | 'Iconic Legend' | 'Iconic Other' | 'Iconic Secret';

export const RARITY_ORDER: Rarity[] = [
  'Common', 'Uncommon', 'Rare', 'Nova Rare', 'Epic', 'Secret', 'Iconic Other', 'Iconic Legend', 'Iconic Secret',
];

export interface Printing {
  id: string;
  cardSlug: string;
  name: string;
  set: string;
  setCode: string;
  collectorNumber: string;
  rarity: Rarity;
  finish: string;
  /** Ścieżka względna do obrazka w aplikacji, np. img/<id>.webp */
  imageUrl: string;
  /** Wspólny klucz dla wydań o tej samej ilustracji. */
  artKey: string;
  cmProductId: number | null;
}

export interface PriceEntry {
  trend: number | null; low: number | null; avg1: number | null; avg7: number | null; avg30: number | null;
  trendFoil: number | null; lowFoil: number | null; avg1Foil: number | null; avg7Foil: number | null; avg30Foil: number | null;
}
export interface PriceFile { createdAt: string; prices: Record<number, PriceEntry>; }
export type HistoryPoint = [date: string, trend: number | null, trendFoil: number | null];
export type PriceHistory = Record<number, HistoryPoint[]>;

export interface GradeResult {
  overall: number; centering: number; corners: number; edges: number; surface: number;
  notes: string; gradedAt: string;
}
export type GradingStatus = 'not-sent' | 'waiting' | 'graded';
export interface InventoryItem {
  id: string; printingId: string; foil: boolean; quantity: number; addedAt: string;
  grade?: GradeResult; gradingStatus?: GradingStatus; gradingRequestId?: string;
}
