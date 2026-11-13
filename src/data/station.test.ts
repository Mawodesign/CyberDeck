import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PHOTO_SLOTS } from '../domain/grading';
import type { Printing } from '../domain/types';
import { inventory, pendingPhotos } from './inventory';
import { sendPending, station, submitGrading, syncResults } from './station';

const store = new Map<string, string>();
// Przypisanie wprost, bo afterEach zdejmuje atrapy ustawione przez vi.stubGlobal (fetch).
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const printing: Printing = {
  id: 'p1', cardSlug: 'x', name: 'Adam Smasher', set: 'Retail', setCode: 'r', collectorNumber: '141',
  rarity: 'Iconic Legend', finish: '', imageUrl: '', artKey: 'p1', cmProductId: null,
};
const photos = () => Object.fromEntries(PHOTO_SLOTS.map((s) => [s, new Blob([`foto-${s}`], { type: 'image/jpeg' })]));
const QR = JSON.stringify({ url: 'https://stacja.example/', token: 'tajnytoken123' });
const okFetch = () => vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

beforeEach(async () => {
  store.clear();
  await inventory.clear();
});
afterEach(() => vi.unstubAllGlobals());

test('pair zapisuje stację, a zły kod daje czytelny błąd', () => {
  expect(station.pair(QR)).toEqual({ url: 'https://stacja.example', token: 'tajnytoken123' });
  expect(station.config()!.url).toBe('https://stacja.example');
  for (const bad of ['https://jakas-strona.pl', '{"url":"ftp://x","token":"tajnytoken123"}', '{"url":"https://x.pl"}', '']) {
    expect(() => station.pair(bad)).toThrow('To nie jest kod stacji gradingu');
  }
});

test('błąd sieci przy wysyłce zostawia zdjęcia w telefonie i status „nie wysłano”', async () => {
  station.pair(QR);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed'); }));
  const item = await inventory.add('p1', false);
  await expect(submitGrading(item, printing, photos())).rejects.toThrow();
  const [saved] = await inventory.all();
  expect(saved.gradingStatus).toBe('not-sent');
  expect(Object.keys(await pendingPhotos.get(saved.gradingRequestId!))).toHaveLength(6);
});

test('ponowienie po powrocie sieci wysyła 6 zdjęć, ustawia „czeka na ocenę” i usuwa zdjęcia z telefonu', async () => {
  station.pair(QR);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed'); }));
  const item = await inventory.add('p1', false);
  await submitGrading(item, printing, photos()).catch(() => {});
  const fetchMock = okFetch();
  vi.stubGlobal('fetch', fetchMock);
  const [pending] = await inventory.all();
  await sendPending(pending, printing);
  const [saved] = await inventory.all();
  expect(saved.gradingStatus).toBe('waiting');
  expect(await pendingPhotos.get(saved.gradingRequestId!)).toEqual({});
  const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
  expect(calls).toHaveLength(7);
  expect(calls[0][0]).toBe(`https://stacja.example/requests/${saved.gradingRequestId}/photos/front`);
  expect((calls[0][1].headers as Record<string, string>)['X-Station-Token']).toBe('tajnytoken123');
  expect(JSON.parse(calls[6][1].body as string)).toMatchObject({ name: 'Adam Smasher', collectorNumber: '141' });
});

test('wysyłka bez sparowanej stacji zostawia status „nie wysłano”', async () => {
  const item = await inventory.add('p1', false);
  await expect(submitGrading(item, printing, photos())).rejects.toThrow('Najpierw połącz');
  expect((await inventory.all())[0].gradingStatus).toBe('not-sent');
});

test('syncResults zapisuje poprawną ocenę i pomija nieprawidłową', async () => {
  station.pair(QR);
  const a = await inventory.add('p1', false);
  const b = await inventory.add('p2', false);
  await inventory.setGradingStatus(a.id, 'waiting', 'req-aaaaaaaa');
  await inventory.setGradingStatus(b.id, 'waiting', 'req-bbbbbbbb');
  const good = { overall: 8.5, centering: 9, corners: 8, edges: 8.5, surface: 8.5, notes: 'ok', gradedAt: '2026-11-13' };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ 'req-aaaaaaaa': good, 'req-bbbbbbbb': { ...good, overall: 99 } }))));
  expect(await syncResults(await inventory.all())).toBe(1);
  const all = await inventory.all();
  expect(all.find((i) => i.id === a.id)).toMatchObject({ gradingStatus: 'graded', grade: good });
  expect(all.find((i) => i.id === b.id)!.gradingStatus).toBe('waiting');
});
