import { expect, test } from 'vitest';
import { isPhotoSlot, isRequestId, parseGradeResult } from './grading';

const good = { overall: 8.5, centering: 9, corners: 8, edges: 8.5, surface: 8.5, notes: 'ok', gradedAt: '2026-11-13' };

test('parseGradeResult przyjmuje poprawny wynik', () => {
  expect(parseGradeResult(good)).toEqual(good);
  expect(parseGradeResult({ ...good, gradedAt: undefined }).gradedAt).toMatch(/^\d{4}-/);
});

test.each([
  [{ ...good, overall: 11 }], [{ ...good, corners: 0 }], [{ ...good, edges: '8' }],
  [{ ...good, surface: NaN }], [{ ...good, notes: undefined }], [null], ['tekst'],
])('parseGradeResult odrzuca %j', (bad) => {
  expect(() => parseGradeResult(bad)).toThrow(/Wynik gradingu/);
});

test('identyfikatory i sloty', () => {
  expect(isRequestId('abc12345-karta')).toBe(true);
  expect(isRequestId('../etc')).toBe(false);
  expect(isRequestId('a/b12345678')).toBe(false);
  expect(isRequestId('krotki')).toBe(false);
  expect(isPhotoSlot('corner-tl')).toBe(true);
  expect(isPhotoSlot('../x')).toBe(false);
});
