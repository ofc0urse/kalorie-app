import {
  deleteEntries,
  entriesForDate,
  getFood,
  putEntries,
  putEntry,
  putFood,
  touchRecent,
} from './db/db';
import { uid } from './lib/text';
import { toast } from './lib/toast';
import type { Entry, Food } from './lib/types';
import { bumpData } from './settings';

/** Operacje na dzienniku z obsługą "Cofnij". */

export async function addEntry(input: {
  date: string;
  meal: string;
  food: Food;
  grams: number;
  portionLabel?: string;
  portionQty?: number;
  silent?: boolean;
}): Promise<Entry> {
  const entry: Entry = {
    id: uid(),
    date: input.date,
    meal: input.meal,
    food: stripFood(input.food),
    grams: input.grams,
    portionLabel: input.portionLabel,
    portionQty: input.portionQty,
    createdAt: Date.now(),
  };
  await putEntry(entry);
  await touchRecent(entry.food, entry.grams);
  await rememberOnlineFood(input.food);
  bumpData();
  if (!input.silent) {
    toast(`Dodano: ${entry.food.name}`, {
      kind: 'success',
      undo: async () => {
        await deleteEntries([entry.id]);
        bumpData();
      },
    });
  }
  return entry;
}

export async function addEntries(list: Omit<Entry, 'id' | 'createdAt'>[], label: string): Promise<Entry[]> {
  const now = Date.now();
  const entries = list.map((e, i) => ({ ...e, food: stripFood(e.food), id: uid(), createdAt: now + i }));
  await putEntries(entries);
  for (const e of entries) await touchRecent(e.food, e.grams);
  bumpData();
  toast(label, {
    kind: 'success',
    undo: async () => {
      await deleteEntries(entries.map((e) => e.id));
      bumpData();
    },
  });
  return entries;
}

export async function updateEntry(prev: Entry, patch: Partial<Entry>): Promise<void> {
  const next = { ...prev, ...patch };
  await putEntry(next);
  bumpData();
  toast('Zapisano zmiany', {
    undo: async () => {
      await putEntry(prev);
      bumpData();
    },
  });
}

export async function removeEntries(entries: Entry[]): Promise<void> {
  if (!entries.length) return;
  await deleteEntries(entries.map((e) => e.id));
  bumpData();
  toast(entries.length === 1 ? `Usunięto: ${entries[0].food.name}` : `Usunięto ${entries.length} pozycje`, {
    undo: async () => {
      await putEntries(entries);
      bumpData();
    },
  });
}

/** Kopiuje posiłek (lub cały dzień, gdy meal = null) z innego dnia. */
export async function copyMeal(fromDate: string, fromMeal: string | null, toDate: string, toMeal: string | null): Promise<number> {
  const src = (await entriesForDate(fromDate)).filter((e) => fromMeal == null || e.meal === fromMeal);
  if (!src.length) {
    toast('Brak wpisów do skopiowania', { kind: 'error' });
    return 0;
  }
  await addEntries(
    src.map((e) => ({
      date: toDate,
      meal: toMeal ?? e.meal,
      food: e.food,
      grams: e.grams,
      portionLabel: e.portionLabel,
      portionQty: e.portionQty,
      note: e.note,
    })),
    `Skopiowano ${src.length} ${plural(src.length, 'pozycję', 'pozycje', 'pozycji')}`,
  );
  return src.length;
}

/** Produkty z OFF/USDA zapisujemy lokalnie – będą dostępne offline i dla skanera. */
async function rememberOnlineFood(f: Food): Promise<void> {
  if (f.source !== 'off' && f.source !== 'usda') return;
  const existing = await getFood(f.id);
  if (!existing) await putFood(f);
}

/** Nie zapisujemy w dzienniku zbędnych pól. */
function stripFood(f: Food): Food {
  return {
    id: f.id,
    source: f.source,
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    per100: { ...f.per100 },
    portions: f.portions ?? [],
    unit: f.unit,
  };
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
