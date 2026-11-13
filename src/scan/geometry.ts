// Geometria czworokątów kart. Czyste funkcje, bez OpenCV.

export interface Point { x: number; y: number }
export type Quad = [Point, Point, Point, Point];

export const CARD_RATIO_MIN = 0.6;
export const CARD_RATIO_MAX = 0.82;
export const CARD_MIN_AREA = 0.02;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function quadArea(q: Point[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function quadCenter(q: Point[]): Point {
  return { x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length };
}

export function pointInQuad(p: Point, q: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      if (sign !== 0 && Math.sign(cross) !== sign) return false;
      sign = Math.sign(cross);
    }
  }
  return true;
}

/**
 * Porządkuje 4 narożniki zgodnie z ruchem wskazówek zegara (na ekranie), zaczynając tak,
 * żeby pierwsza krawędź była krótszym bokiem karty, a punkt startowy leżał wyżej.
 * Po wyprostowaniu karta jest więc zawsze pionowa (może być do góry nogami).
 */
export function orderCorners(pts: Point[]): Quad {
  const c = quadCenter(pts);
  const sorted = pts.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  const edge = (i: number) => dist(sorted[i], sorted[(i + 1) % 4]);
  // Kandydaci na start: początki dwóch krótszych (przeciwległych) krawędzi.
  const firstShort = edge(0) + edge(2) <= edge(1) + edge(3) ? 0 : 1;
  const a = firstShort;
  const b = firstShort + 2;
  const start = sorted[a].y < sorted[b].y || (sorted[a].y === sorted[b].y && sorted[a].x <= sorted[b].x) ? a : b;
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]) as Quad;
}

/** Czy uporządkowany czworokąt ma proporcje karty (63×88 mm) i zajmuje co najmniej 2% klatki. */
export function isCardShaped(q: Quad, frameW: number, frameH: number): boolean {
  const short = (dist(q[0], q[1]) + dist(q[2], q[3])) / 2;
  const long = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2;
  if (long === 0) return false;
  const ratio = short / long;
  return ratio >= CARD_RATIO_MIN && ratio <= CARD_RATIO_MAX && quadArea(q) >= CARD_MIN_AREA * frameW * frameH;
}

/** Zostawia największe czworokąty, odrzucając te, których środek leży wewnątrz już wybranego. */
export function dropNested(quads: Quad[], max: number): Quad[] {
  const out: Quad[] = [];
  for (const q of quads.slice().sort((a, b) => quadArea(b) - quadArea(a))) {
    if (out.length >= max) break;
    if (!out.some((o) => pointInQuad(quadCenter(q), o))) out.push(q);
  }
  return out;
}
