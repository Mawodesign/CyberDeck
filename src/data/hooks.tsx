import { createContext, useContext, useEffect, useState } from 'react';
import type { InventoryItem } from '../domain/types';
import type { Catalog } from './catalog';
import { inventory } from './inventory';

export const CatalogContext = createContext<Catalog | null>(null);
export function useCatalog(): Catalog {
  const c = useContext(CatalogContext);
  if (!c) throw new Error('Brak katalogu');
  return c;
}

export function useInventory(): InventoryItem[] {
  const [items, setItems] = useState<InventoryItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => inventory.all().then((all) => alive && setItems(all));
    load();
    const off = inventory.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return items;
}

export interface AppActions {
  toast(message: string, error?: boolean): void;
  openCard(printingId: string): void;
  openGrading(itemId: string): void;
}
export const ActionsContext = createContext<AppActions | null>(null);
export function useActions(): AppActions {
  const a = useContext(ActionsContext);
  if (!a) throw new Error('Brak akcji');
  return a;
}
