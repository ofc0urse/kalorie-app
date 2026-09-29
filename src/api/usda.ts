import { cacheGet, cacheSet } from '../db/db';
import { round1 } from '../lib/nutrition';
import { normalize } from '../lib/text';
import type { Food } from '../lib/types';
import { RateLimitedError, RateLimiter } from './rateLimit';

/**
 * USDA FoodData Central – https://api.nal.usda.gov/fdc/v1/foods/search
 * Szukamy tylko w danych ogólnych (Foundation, SR Legacy) – to uzupełnienie dla produktów
 * nieprzetworzonych. Nazwy są po angielsku.
 * Limit: klucz własny 1000 zapytań/h; DEMO_KEY – bardzo mały (dziesiątki na godzinę).
 */
export const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

const demoLimiter = new RateLimiter(8, 60 * 60_000);
const keyLimiter = new RateLimiter(60, 60 * 60_000);
const TTL = 1000 * 60 * 60 * 24 * 14;

interface UsdaNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

interface UsdaFood {
  fdcId: number;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  foodNutrients?: UsdaNutrient[];
}

// numer (nutrientNumber) i identyfikator (nutrientId) składnika w FDC
const N = {
  kcal: { nums: ['208'], ids: [1008] },
  kcalAtwater: { nums: ['957', '958'], ids: [2047, 2048] },
  protein: { nums: ['203'], ids: [1003] },
  fat: { nums: ['204'], ids: [1004] },
  carbs: { nums: ['205'], ids: [1005] },
  fiber: { nums: ['291'], ids: [1079] },
};

function pick(list: UsdaNutrient[], def: { nums: string[]; ids: number[] }): number | undefined {
  const n = list.find((x) => (x.nutrientNumber && def.nums.includes(String(x.nutrientNumber))) || (x.nutrientId && def.ids.includes(x.nutrientId)));
  if (!n || typeof n.value !== 'number') return undefined;
  if (n.unitName && /kj/i.test(n.unitName)) return n.value / 4.184;
  return n.value;
}

export function usdaToFood(f: UsdaFood): Food | null {
  const list = f.foodNutrients ?? [];
  const kcal = pick(list, N.kcal) ?? pick(list, N.kcalAtwater);
  if (kcal == null || !f.description) return null;
  const fiber = pick(list, N.fiber) ?? 0;
  const carbsTotal = pick(list, N.carbs) ?? 0;
  const name = f.description.charAt(0) + f.description.slice(1).toLowerCase();
  return {
    id: `usda:${f.fdcId}`,
    source: 'usda',
    name,
    brand: f.brandOwner,
    per100: {
      kcal: round1(kcal),
      protein: round1(pick(list, N.protein) ?? 0),
      fat: round1(pick(list, N.fat) ?? 0),
      // USDA podaje węglowodany ogółem (z błonnikiem) – przeliczamy na przyswajalne jak w UE
      carbs: round1(Math.max(0, carbsTotal - fiber)),
      fiber: round1(fiber),
    },
    portions: [],
  };
}

export async function searchUSDA(query: string, apiKey: string, signal?: AbortSignal): Promise<{ foods: Food[]; fromCache: boolean }> {
  const q = query.trim();
  if (q.length < 2) return { foods: [], fromCache: false };
  const key = `usda:s:${normalize(q)}`;
  const cached = await cacheGet<Food[]>(key, TTL);
  if (cached) return { foods: cached, fromCache: true };
  const limiter = apiKey ? keyLimiter : demoLimiter;
  if (!limiter.tryTake()) throw new RateLimitedError(limiter.waitMs(), 'USDA');
  const params = new URLSearchParams({
    api_key: apiKey || 'DEMO_KEY',
    query: q,
    dataType: 'Foundation,SR Legacy',
    pageSize: '20',
  });
  const res = await fetch(`${USDA_SEARCH_URL}?${params}`, { signal });
  if (res.status === 429) throw new RateLimitedError(60 * 60_000, 'USDA (limit klucza)');
  if (res.status === 403) throw new Error('USDA: nieprawidłowy klucz API – sprawdź ustawienia.');
  if (!res.ok) throw new Error(`USDA: błąd ${res.status}`);
  const json = (await res.json()) as { foods?: UsdaFood[] };
  const foods = (json.foods ?? []).map(usdaToFood).filter((f): f is Food => !!f);
  await cacheSet(key, foods);
  return { foods, fromCache: false };
}
