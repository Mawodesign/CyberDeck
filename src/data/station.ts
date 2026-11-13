// Połączenie aplikacji ze stacją gradingu na komputerze.
import { parseGradeResult, PHOTO_SLOTS, type GradingRequest } from '../domain/grading';
import type { GradeResult, InventoryItem, Printing } from '../domain/types';
import { inventory, pendingPhotos } from './inventory';

const KEY = 'knc-station';
export interface StationConfig { url: string; token: string }

async function call(cfg: StationConfig, path: string, init: RequestInit = {}, timeoutMs = 60000): Promise<Response> {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), 'X-Station-Token': cfg.token },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Stacja odpowiedziała błędem ${res.status}`);
  return res;
}

export const station = {
  config(): StationConfig | null {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as StationConfig | null;
      return c && typeof c.url === 'string' && typeof c.token === 'string' ? c : null;
    } catch {
      return null;
    }
  },

  /** Zapisuje dane stacji z kodu QR (JSON z polami url i token). */
  pair(qrText: string): StationConfig {
    let c: Partial<StationConfig> | null = null;
    try { c = JSON.parse(qrText.trim()); } catch { /* błąd niżej */ }
    if (!c || typeof c.url !== 'string' || !/^https?:\/\/[^\s]+$/.test(c.url) || typeof c.token !== 'string' || c.token.length < 8) {
      throw new Error('To nie jest kod stacji gradingu');
    }
    const cfg = { url: c.url.replace(/\/+$/, ''), token: c.token };
    localStorage.setItem(KEY, JSON.stringify(cfg));
    return cfg;
  },

  unpair(): void {
    localStorage.removeItem(KEY);
  },

  async isReachable(): Promise<boolean> {
    const cfg = station.config();
    if (!cfg) return false;
    try {
      await call(cfg, '/ping', {}, 4000);
      return true;
    } catch {
      return false;
    }
  },

  async send(req: GradingRequest, photos: Record<string, Blob>): Promise<void> {
    const cfg = station.config();
    if (!cfg) throw new Error('Najpierw połącz aplikację ze stacją gradingu');
    for (const slot of PHOTO_SLOTS) {
      if (!photos[slot]) throw new Error('Brakuje zdjęć do wysłania');
      await call(cfg, `/requests/${req.id}/photos/${slot}`, { method: 'PUT', body: photos[slot] });
    }
    await call(cfg, `/requests/${req.id}`, { method: 'POST', body: JSON.stringify(req) });
  },

  async fetchResults(ids: string[]): Promise<Record<string, GradeResult>> {
    const cfg = station.config();
    if (!cfg || ids.length === 0) return {};
    const raw = await (await call(cfg, `/results?ids=${ids.join(',')}`, {}, 8000)).json() as Record<string, unknown>;
    const out: Record<string, GradeResult> = {};
    for (const [id, value] of Object.entries(raw)) {
      try { out[id] = parseGradeResult(value); } catch { /* pomijamy nieprawidłowy wynik */ }
    }
    return out;
  },
};

const newRequestId = () => crypto.randomUUID();

/** Zapisuje zdjęcia w telefonie i próbuje je wysłać. Gdy wysyłka się nie uda, pozycja ma status „nie wysłano”. */
export async function submitGrading(item: InventoryItem, printing: Printing, photos: Record<string, Blob>): Promise<void> {
  const requestId = newRequestId();
  for (const slot of PHOTO_SLOTS) {
    if (!photos[slot]) throw new Error('Zrób wszystkie sześć zdjęć');
    await pendingPhotos.put(requestId, slot, photos[slot]);
  }
  await inventory.update(item.id, { gradingStatus: 'not-sent', gradingRequestId: requestId, grade: undefined });
  await sendPending({ ...item, gradingRequestId: requestId }, printing);
}

/** Wysyła zdjęcia czekające w telefonie. Po sukcesie status „czeka na ocenę”, a zdjęcia znikają z telefonu. */
export async function sendPending(item: InventoryItem, printing: Printing): Promise<void> {
  const requestId = item.gradingRequestId;
  if (!requestId) throw new Error('Brak zdjęć do wysłania');
  const photos = await pendingPhotos.get(requestId);
  await station.send({
    id: requestId, printingId: printing.id, name: printing.name, set: printing.set,
    collectorNumber: printing.collectorNumber, foil: item.foil, createdAt: new Date().toISOString(),
    photos: PHOTO_SLOTS.map((s) => `${s}.jpg`),
  }, photos);
  await inventory.setGradingStatus(item.id, 'waiting');
  await pendingPhotos.remove(requestId);
}

/** Pobiera gotowe oceny dla kart czekających na ocenę. Zwraca liczbę nowych ocen. */
export async function syncResults(items: InventoryItem[]): Promise<number> {
  const waiting = items.filter((i) => i.gradingStatus === 'waiting' && i.gradingRequestId);
  const results = await station.fetchResults(waiting.map((i) => i.gradingRequestId!));
  let n = 0;
  for (const item of waiting) {
    const grade = results[item.gradingRequestId!];
    if (grade) {
      await inventory.setGrade(item.id, grade);
      n++;
    }
  }
  return n;
}
