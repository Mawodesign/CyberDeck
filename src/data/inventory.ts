import { openDB, type IDBPDatabase } from 'idb';
import type { GradeResult, GradingStatus, InventoryItem } from '../domain/types';

const BACKUP_APP = 'kolekcja-night-city';
const BACKUP_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB('kolekcja-night-city', 1, {
    upgrade(d) {
      d.createObjectStore('items', { keyPath: 'id' });
      d.createObjectStore('photos');
    },
  });
  return dbPromise;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const newId = () => crypto.randomUUID();

function isItem(x: unknown): x is InventoryItem {
  const o = x as InventoryItem;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && typeof o.printingId === 'string'
    && typeof o.foil === 'boolean' && Number.isInteger(o.quantity) && o.quantity > 0 && typeof o.addedAt === 'string';
}

export const inventory = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  async all(): Promise<InventoryItem[]> {
    return (await db()).getAll('items');
  },

  /** Dodaje kartę; ta sama para wydanie+foil zwiększa ilość istniejącej pozycji. */
  async add(printingId: string, foil: boolean, quantity = 1): Promise<InventoryItem> {
    const d = await db();
    const existing = (await d.getAll('items') as InventoryItem[]).find((i) => i.printingId === printingId && i.foil === foil);
    const item: InventoryItem = existing
      ? { ...existing, quantity: existing.quantity + quantity }
      : { id: newId(), printingId, foil, quantity, addedAt: new Date().toISOString() };
    await d.put('items', item);
    notify();
    return item;
  },

  async setQuantity(id: string, n: number): Promise<void> {
    const d = await db();
    const item = await d.get('items', id) as InventoryItem | undefined;
    if (!item) return;
    if (n <= 0) await d.delete('items', id);
    else await d.put('items', { ...item, quantity: n });
    notify();
  },

  async update(id: string, patch: Partial<InventoryItem>): Promise<void> {
    const d = await db();
    const item = await d.get('items', id) as InventoryItem | undefined;
    if (!item) return;
    await d.put('items', { ...item, ...patch, id });
    notify();
  },

  setGrade(id: string, grade: GradeResult): Promise<void> {
    return inventory.update(id, { grade, gradingStatus: 'graded' });
  },

  setGradingStatus(id: string, gradingStatus: GradingStatus, gradingRequestId?: string): Promise<void> {
    return inventory.update(id, gradingRequestId ? { gradingStatus, gradingRequestId } : { gradingStatus });
  },

  async exportJson(): Promise<string> {
    return JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION, items: await inventory.all() }, null, 1);
  },

  /** Zastępuje inwentarz zawartością kopii. Nieprawidłowy plik niczego nie zmienia. */
  async importJson(text: string): Promise<number> {
    let data: { app?: unknown; version?: unknown; items?: unknown };
    try { data = JSON.parse(text); } catch { throw new Error('Nieprawidłowy plik kopii'); }
    if (!data || data.app !== BACKUP_APP || data.version !== BACKUP_VERSION
      || !Array.isArray(data.items) || !data.items.every(isItem)) {
      throw new Error('Nieprawidłowy plik kopii');
    }
    const d = await db();
    const tx = d.transaction('items', 'readwrite');
    await tx.store.clear();
    for (const it of data.items as InventoryItem[]) await tx.store.put(it);
    await tx.done;
    notify();
    return data.items.length;
  },

  async clear(): Promise<void> {
    await (await db()).clear('items');
    notify();
  },
};

/** Zdjęcia gradingu czekające na wysyłkę, klucz „<requestId>/<slot>”. */
export const pendingPhotos = {
  // Zapis jako ArrayBuffer, bo Blob w IndexedDB bywa zawodny w Safari.
  async put(requestId: string, slot: string, blob: Blob): Promise<void> {
    const record = { type: blob.type || 'image/jpeg', data: await blob.arrayBuffer() };
    await (await db()).put('photos', record, `${requestId}/${slot}`);
  },
  async get(requestId: string): Promise<Record<string, Blob>> {
    const d = await db();
    const out: Record<string, Blob> = {};
    for (const key of await d.getAllKeys('photos')) {
      const [rid, slot] = String(key).split('/');
      if (rid !== requestId) continue;
      const record = await d.get('photos', key) as { type: string; data: ArrayBuffer };
      out[slot] = new Blob([record.data], { type: record.type });
    }
    return out;
  },
  async remove(requestId: string): Promise<void> {
    const d = await db();
    for (const key of await d.getAllKeys('photos')) {
      if (String(key).startsWith(`${requestId}/`)) await d.delete('photos', key);
    }
  },
};
