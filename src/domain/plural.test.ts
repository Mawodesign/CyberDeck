import { expect, test } from 'vitest';
import { cardsAcc, cardsWord } from './plural';

test('odmiana słowa karta', () => {
  expect([0, 1, 2, 4, 5, 12, 22, 25, 112].map(cardsWord)).toEqual(['kart', 'karta', 'karty', 'karty', 'kart', 'kart', 'karty', 'kart', 'kart']);
  expect([1, 3, 6].map(cardsAcc)).toEqual(['kartę', 'karty', 'kart']);
});
