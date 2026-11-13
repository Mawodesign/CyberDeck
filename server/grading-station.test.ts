import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { PHOTO_SLOTS } from '../src/domain/grading';
import { createStation } from './grading-station';

const dir = mkdtempSync(join(tmpdir(), 'stacja-'));
const token = 'sekret';
const server = createStation({ dir, token });
let base = '';
const h = { 'X-Station-Token': token };
const ID = 'abc12345-karta';

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('żądanie bez tokenu lub ze złym tokenem → 401', async () => {
  expect((await fetch(`${base}/ping`)).status).toBe(401);
  expect((await fetch(`${base}/ping`, { headers: { 'X-Station-Token': 'inny' } })).status).toBe(401);
  expect((await fetch(`${base}/ping`, { headers: h })).status).toBe(200);
});

test('preflight CORS przechodzi bez tokenu', async () => {
  const res = await fetch(`${base}/requests/${ID}`, { method: 'OPTIONS' });
  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-headers')).toContain('X-Station-Token');
});

test('zamknięcie zgłoszenia bez kompletu zdjęć → 400, nic nie trafia do inbox', async () => {
  await fetch(`${base}/requests/${ID}/photos/front`, { method: 'PUT', headers: h, body: 'jpg' });
  const res = await fetch(`${base}/requests/${ID}`, { method: 'POST', headers: h, body: JSON.stringify({ name: 'X' }) });
  expect(res.status).toBe(400);
  expect(existsSync(join(dir, 'inbox', ID))).toBe(false);
});

test('komplet zdjęć i zamknięcie tworzą folder z request.json i zdjęciami', async () => {
  for (const slot of PHOTO_SLOTS) {
    const res = await fetch(`${base}/requests/${ID}/photos/${slot}`, { method: 'PUT', headers: h, body: `zdjecie-${slot}` });
    expect(res.status).toBe(200);
  }
  const res = await fetch(`${base}/requests/${ID}`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ printingId: 'p1', name: 'Adam Smasher', set: 'Retail', collectorNumber: '141', foil: true, createdAt: '2026-11-13' }),
  });
  expect(await res.json()).toEqual({ id: ID });
  const request = JSON.parse(readFileSync(join(dir, 'inbox', ID, 'request.json'), 'utf8'));
  expect(request).toMatchObject({ id: ID, name: 'Adam Smasher', foil: true });
  expect(request.photos).toHaveLength(6);
  expect(readFileSync(join(dir, 'inbox', ID, 'corner-bl.jpg'), 'utf8')).toBe('zdjecie-corner-bl');
});

test.each([
  ['PUT', '/requests/..%2F..%2Fzle/photos/front'],
  ['PUT', '/requests/../photos/front'],
  ['PUT', `/requests/${ID}/photos/..%2Fzle`],
  ['PUT', `/requests/${ID}/photos/inny-slot`],
  ['POST', '/requests/x'],
])('nieprawidłowy identyfikator lub slot: %s %s → 400 lub 404', async (method, path) => {
  const res = await fetch(`${base}${path}`, { method, headers: h, body: 'x' });
  expect([400, 404]).toContain(res.status);
});

test('GET /results zwraca tylko istniejące i poprawne wyniki', async () => {
  const good = { overall: 8.5, centering: 9, corners: 8, edges: 8.5, surface: 8.5, notes: 'Lekkie wybielenie rogu.', gradedAt: '2026-11-13' };
  writeFileSync(join(dir, 'results', `${ID}.json`), JSON.stringify(good));
  writeFileSync(join(dir, 'results', 'zly-wynik-1.json'), JSON.stringify({ ...good, overall: 11 }));
  writeFileSync(join(dir, 'results', 'zepsuty-json.json'), '{');
  const res = await fetch(`${base}/results?ids=${ID},zly-wynik-1,zepsuty-json,nie-ma-takiego,../x`, { headers: h });
  expect(await res.json()).toEqual({ [ID]: good });
});
