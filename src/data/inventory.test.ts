import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { inventory } from './inventory';

beforeEach(() => inventory.clear());

test('dodanie tej samej pary wydanie+foil zwiększa ilość', async () => {
  await inventory.add('p1', false);
  await inventory.add('p1', false, 2);
  await inventory.add('p1', true);
  const all = await inventory.all();
  expect(all).toHaveLength(2);
  expect(all.find((i) => !i.foil)!.quantity).toBe(3);
});

test('setQuantity 0 usuwa pozycję', async () => {
  const it = await inventory.add('p1', false);
  await inventory.setQuantity(it.id, 0);
  expect(await inventory.all()).toHaveLength(0);
});

test('setGrade zapisuje ocenę i status', async () => {
  const it = await inventory.add('p1', false);
  await inventory.setGrade(it.id, { overall: 8.5, centering: 9, corners: 8, edges: 8.5, surface: 8.5, notes: 'ok', gradedAt: '2026-11-13' });
  const [saved] = await inventory.all();
  expect(saved.grade!.overall).toBe(8.5);
  expect(saved.gradingStatus).toBe('graded');
});

test('eksport, wyczyszczenie i import odtwarzają pozycje', async () => {
  await inventory.add('p1', false, 2);
  await inventory.add('p2', true);
  const backup = await inventory.exportJson();
  await inventory.clear();
  expect(await inventory.importJson(backup)).toBe(2);
  const all = await inventory.all();
  expect(all.map((i) => i.printingId).sort()).toEqual(['p1', 'p2']);
});

test.each([
  ['nie json'],
  ['{"foo":1}'],
  ['{"app":"kolekcja-night-city","version":1,"items":[{"id":"x"}]}'],
  ['{"app":"inna","version":1,"items":[]}'],
])('import nieprawidłowego pliku %s nie zmienia danych', async (text) => {
  await inventory.add('p1', false);
  await expect(inventory.importJson(text)).rejects.toThrow('Nieprawidłowy plik kopii');
  expect(await inventory.all()).toHaveLength(1);
});
