import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Entry, Food, Recipe, Settings, WaterEntry, WeightEntry } from '../lib/types';

export interface FavoriteRow {
  id: string;
  food: Food;
  addedAt: number;
}

export interface RecentRow {
  id: string;
  food: Food;
  lastUsed: number;
  count: number;
  lastGrams: number;
}

export interface CacheRow {
  key: string;
  ts: number;
  data: unknown;
}

interface KalorieDB extends DBSchema {
  entries: { key: string; value: Entry; indexes: { date: string } };
  foods: { key: string; value: Food; indexes: { barcode: string } };
  recipes: { key: string; value: Recipe };
  favorites: { key: string; value: FavoriteRow };
  recents: { key: string; value: RecentRow; indexes: { lastUsed: number } };
  weights: { key: string; value: WeightEntry };
  water: { key: string; value: WaterEntry };
  kv: { key: string; value: unknown };
  cache: { key: string; value: CacheRow };
}

export type StoreName = 'entries' | 'foods' | 'recipes' | 'favorites' | 'recents' | 'weights' | 'water' | 'kv' | 'cache';

export const DB_NAME = 'kalorie';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<KalorieDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<KalorieDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KalorieDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('date', 'date');
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('barcode', 'barcode');
        db.createObjectStore('recipes', { keyPath: 'id' });
        db.createObjectStore('favorites', { keyPath: 'id' });
        const recents = db.createObjectStore('recents', { keyPath: 'id' });
        recents.createIndex('lastUsed', 'lastUsed');
        db.createObjectStore('weights', { keyPath: 'date' });
        db.createObjectStore('water', { keyPath: 'date' });
        db.createObjectStore('kv');
        db.createObjectStore('cache', { keyPath: 'key' });
      },
      blocking() {
        // Inna karta chce zaktualizować bazę – zamykamy połączenie.
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Tylko do testów. */
export async function resetDBForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

// ---------- Wpisy ----------

export async function entriesForDate(date: string): Promise<Entry[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('entries', 'date', date);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function entriesInRange(from: string, to: string): Promise<Entry[]> {
  const db = await getDB();
  return db.getAllFromIndex('entries', 'date', IDBKeyRange.bound(from, to));
}

export async function putEntry(e: Entry): Promise<void> {
  const db = await getDB();
  await db.put('entries', e);
}

export async function putEntries(list: Entry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  await Promise.all([...list.map((e) => tx.store.put(e)), tx.done]);
}

export async function deleteEntries(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('entries', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function allDatesWithEntries(): Promise<string[]> {
  const db = await getDB();
  const dates = new Set<string>();
  let cursor = await db.transaction('entries').store.index('date').openKeyCursor(null, 'prevunique');
  while (cursor) {
    dates.add(cursor.key as string);
    cursor = await cursor.continue();
  }
  return [...dates];
}

// ---------- Produkty własne / zapisane ----------

export async function putFood(f: Food): Promise<void> {
  const db = await getDB();
  await db.put('foods', { ...f, updatedAt: Date.now(), createdAt: f.createdAt ?? Date.now() });
}

export async function getFood(id: string): Promise<Food | undefined> {
  const db = await getDB();
  return db.get('foods', id);
}

export async function deleteFood(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('foods', id);
}

export async function allFoods(): Promise<Food[]> {
  const db = await getDB();
  return db.getAll('foods');
}

export async function foodByBarcode(code: string): Promise<Food | undefined> {
  const db = await getDB();
  const list = await db.getAllFromIndex('foods', 'barcode', code);
  // Własny produkt ma pierwszeństwo przed zapisanym z Open Food Facts
  return list.find((f) => f.source === 'custom') ?? list[0];
}

// ---------- Przepisy ----------

export async function allRecipes(): Promise<Recipe[]> {
  const db = await getDB();
  return (await db.getAll('recipes')).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

export async function putRecipe(r: Recipe): Promise<void> {
  const db = await getDB();
  await db.put('recipes', r);
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  const db = await getDB();
  return db.get('recipes', id);
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recipes', id);
  await db.delete('favorites', `recipe:${id}`);
  await db.delete('recents', `recipe:${id}`);
}

// ---------- Ulubione i ostatnie ----------

export async function allFavorites(): Promise<FavoriteRow[]> {
  const db = await getDB();
  return (await db.getAll('favorites')).sort((a, b) => a.food.name.localeCompare(b.food.name, 'pl'));
}

export async function isFavorite(id: string): Promise<boolean> {
  const db = await getDB();
  return (await db.getKey('favorites', id)) !== undefined;
}

export async function toggleFavorite(food: Food): Promise<boolean> {
  const db = await getDB();
  if (await db.getKey('favorites', food.id)) {
    await db.delete('favorites', food.id);
    return false;
  }
  await db.put('favorites', { id: food.id, food, addedAt: Date.now() });
  return true;
}

export async function touchRecent(food: Food, grams: number): Promise<void> {
  const db = await getDB();
  const prev = await db.get('recents', food.id);
  await db.put('recents', {
    id: food.id,
    food,
    lastUsed: Date.now(),
    count: (prev?.count ?? 0) + 1,
    lastGrams: grams,
  });
}

export async function recentFoods(limit = 30): Promise<RecentRow[]> {
  const db = await getDB();
  const out: RecentRow[] = [];
  let cursor = await db.transaction('recents').store.index('lastUsed').openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export async function getRecent(id: string): Promise<RecentRow | undefined> {
  const db = await getDB();
  return db.get('recents', id);
}

// ---------- Waga i woda ----------

export async function setWeight(date: string, kg: number | null): Promise<void> {
  const db = await getDB();
  if (kg == null) await db.delete('weights', date);
  else await db.put('weights', { date, kg });
}

export async function getWeight(date: string): Promise<WeightEntry | undefined> {
  const db = await getDB();
  return db.get('weights', date);
}

export async function allWeights(): Promise<WeightEntry[]> {
  const db = await getDB();
  return db.getAll('weights');
}

export async function latestWeightOnOrBefore(date: string): Promise<WeightEntry | undefined> {
  const db = await getDB();
  const cursor = await db.transaction('weights').store.openCursor(IDBKeyRange.upperBound(date), 'prev');
  return cursor?.value;
}

export async function getWater(date: string): Promise<number> {
  const db = await getDB();
  return (await db.get('water', date))?.ml ?? 0;
}

export async function setWater(date: string, ml: number): Promise<void> {
  const db = await getDB();
  await db.put('water', { date, ml: Math.max(0, Math.round(ml)) });
}

export async function waterInRange(from: string, to: string): Promise<WaterEntry[]> {
  const db = await getDB();
  return db.getAll('water', IDBKeyRange.bound(from, to));
}

// ---------- Ustawienia ----------

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get('kv', key)) as T | undefined;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('kv', value, key);
}

export async function loadSettingsRaw(): Promise<Partial<Settings> | undefined> {
  return kvGet<Partial<Settings>>('settings');
}

// ---------- Cache zapytań sieciowych ----------

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  const db = await getDB();
  const row = await db.get('cache', key);
  if (!row) return undefined;
  if (Date.now() - row.ts > maxAgeMs) return undefined;
  return row.data as T;
}

export async function cacheSet(key: string, data: unknown): Promise<void> {
  const db = await getDB();
  await db.put('cache', { key, ts: Date.now(), data });
}

/** Usuwa wpisy cache starsze niż maxAge (wywoływane przy starcie). */
export async function cachePrune(maxAgeMs: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('cache', 'readwrite');
  let cursor = await tx.store.openCursor();
  const limit = Date.now() - maxAgeMs;
  while (cursor) {
    if (cursor.value.ts < limit) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// ---------- Kopia zapasowa ----------

export const BACKUP_STORES: StoreName[] = ['entries', 'foods', 'recipes', 'favorites', 'recents', 'weights', 'water'];

export async function dumpStores(): Promise<Record<string, unknown[]>> {
  const db = await getDB();
  const out: Record<string, unknown[]> = {};
  for (const s of BACKUP_STORES) out[s] = await db.getAll(s);
  return out;
}

export async function restoreStores(data: Record<string, unknown[]>, mode: 'replace' | 'merge'): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(BACKUP_STORES, 'readwrite');
  for (const s of BACKUP_STORES) {
    const store = tx.objectStore(s);
    if (mode === 'replace') await store.clear();
    for (const row of data[s] ?? []) await store.put(row as never);
  }
  await tx.done;
}
