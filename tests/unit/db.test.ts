import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheGet,
  cacheSet,
  entriesForDate,
  entriesInRange,
  foodByBarcode,
  latestWeightOnOrBefore,
  putEntry,
  putFood,
  recentFoods,
  resetDBForTests,
  setWeight,
  touchRecent,
  DB_NAME,
} from '../../src/db/db';
import type { Entry, Food } from '../../src/lib/types';

const food: Food = { id: 'custom:1', source: 'custom', name: 'Test', barcode: '5900000000001', per100: { kcal: 100, protein: 1, fat: 1, carbs: 1, fiber: 1 }, portions: [] };

beforeEach(async () => {
  await resetDBForTests();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
});

describe('IndexedDB', () => {
  it('zapisuje i czyta wpisy po dacie', async () => {
    const e = (id: string, date: string, t: number): Entry => ({ id, date, meal: 'breakfast', food, grams: 100, createdAt: t });
    await putEntry(e('b', '2026-09-01', 2));
    await putEntry(e('a', '2026-09-01', 1));
    await putEntry(e('c', '2026-09-03', 3));
    expect((await entriesForDate('2026-09-01')).map((x) => x.id)).toEqual(['a', 'b']);
    expect(await entriesInRange('2026-09-02', '2026-09-30')).toHaveLength(1);
  });
  it('wyszukuje produkt po kodzie kreskowym', async () => {
    await putFood(food);
    expect((await foodByBarcode('5900000000001'))?.name).toBe('Test');
    expect(await foodByBarcode('123')).toBeUndefined();
  });
  it('ostatnie produkty w kolejności użycia', async () => {
    await touchRecent(food, 100);
    await new Promise((r) => setTimeout(r, 5));
    await touchRecent({ ...food, id: 'custom:2', name: 'Drugi' }, 50);
    const r = await recentFoods();
    expect(r.map((x) => x.food.name)).toEqual(['Drugi', 'Test']);
  });
  it('ostatni pomiar wagi', async () => {
    await setWeight('2026-09-01', 80);
    await setWeight('2026-09-10', 79);
    expect((await latestWeightOnOrBefore('2026-09-05'))?.kg).toBe(80);
    expect((await latestWeightOnOrBefore('2026-09-30'))?.kg).toBe(79);
    expect(await latestWeightOnOrBefore('2026-08-01')).toBeUndefined();
  });
  it('cache z czasem życia', async () => {
    await cacheSet('k', { a: 1 });
    expect(await cacheGet('k', 1000)).toEqual({ a: 1 });
    expect(await cacheGet('k', -1)).toBeUndefined();
  });
});
