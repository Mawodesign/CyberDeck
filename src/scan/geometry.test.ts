import { expect, test } from 'vitest';
import { dropNested, isCardShaped, orderCorners, quadArea, type Point, type Quad } from './geometry';

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
];
const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test('orderCorners: pionowa karta zaczyna od lewego górnego rogu, zgodnie z zegarem', () => {
  const [a, b, c, d] = rect(10, 20, 63, 88);
  expect(orderCorners([c, a, d, b])).toEqual([a, b, c, d]);
});

test('orderCorners: karta leżąca poziomo daje pierwszą krawędź krótką', () => {
  const q = orderCorners(rect(0, 0, 88, 63).reverse());
  expect(len(q[0], q[1])).toBeCloseTo(63);
  expect(len(q[1], q[2])).toBeCloseTo(88);
});

test('orderCorners: karta obrócona o 30 stopni', () => {
  const t = Math.PI / 6;
  const rot = (p: Point) => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t) + 200, y: p.x * Math.sin(t) + p.y * Math.cos(t) + 200 });
  const q = orderCorners(rect(0, 0, 63, 88).map(rot));
  expect(len(q[0], q[1])).toBeCloseTo(63);
  expect(q[0].y).toBeLessThan(q[2].y);
});

test('isCardShaped: przyjmuje 63×88, odrzuca kwadrat, pasek i za małą kartę', () => {
  const card = (w: number, h: number) => orderCorners(rect(0, 0, w, h));
  expect(isCardShaped(card(126, 176), 640, 480)).toBe(true);
  expect(isCardShaped(card(150, 150), 640, 480)).toBe(false);
  expect(isCardShaped(card(60, 200), 640, 480)).toBe(false);
  expect(isCardShaped(card(31, 44), 640, 480)).toBe(false);
});

test('dropNested: odrzuca ramkę ilustracji wewnątrz karty i trzyma limit', () => {
  const outer = orderCorners(rect(0, 0, 126, 176));
  const inner = orderCorners(rect(10, 10, 100, 140));
  const other = orderCorners(rect(300, 0, 126, 176));
  const kept = dropNested([inner, other, outer] as Quad[], 6);
  expect(kept).toHaveLength(2);
  expect(kept.map(quadArea)).toEqual([126 * 176, 126 * 176]);
  expect(dropNested([outer, other], 1)).toHaveLength(1);
});
