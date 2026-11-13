/** Polska odmiana: 1 karta, 2–4 karty, 5+ kart (12–14 też kart). */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (n === 1) return one;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}
export const cardsWord = (n: number) => plural(n, 'karta', 'karty', 'kart');
export const cardsAcc = (n: number) => plural(n, 'kartę', 'karty', 'kart');
