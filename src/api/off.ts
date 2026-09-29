import { cacheGet, cacheSet } from '../db/db';
import { kcalFromMacros, round1 } from '../lib/nutrition';
import { normalize } from '../lib/text';
import type { Food, Portion } from '../lib/types';
import { RateLimitedError, RateLimiter } from './rateLimit';

/**
 * Open Food Facts.
 * - wyszukiwanie: search-a-licious – https://search.openfoodfacts.org/search
 * - produkt po kodzie: API v2 – https://world.openfoodfacts.org/api/v2/product/{kod}
 * Limity OFF: 10 wyszukiwań/min i 15 odczytów produktu/min na użytkownika (IP).
 * Trzymamy się poniżej z zapasem.
 */
export const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search';
export const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';

export const offSearchLimiter = new RateLimiter(8, 60_000);
export const offProductLimiter = new RateLimiter(12, 60_000);

const SEARCH_TTL = 1000 * 60 * 60 * 24 * 3; // 3 dni
const PRODUCT_TTL = 1000 * 60 * 60 * 24 * 7; // 7 dni
const NOT_FOUND_TTL = 1000 * 60 * 60 * 12;

const SEARCH_FIELDS = [
  'code',
  'product_name',
  'product_name_pl',
  'product_name_en',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
];

const PRODUCT_FIELDS = [...SEARCH_FIELDS, 'image_front_small_url', 'nutrition_data_per'];

interface OffNutriments {
  'energy-kcal_100g'?: number | string;
  'energy-kj_100g'?: number | string;
  energy_100g?: number | string;
  proteins_100g?: number | string;
  fat_100g?: number | string;
  carbohydrates_100g?: number | string;
  fiber_100g?: number | string;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_pl?: string;
  product_name_en?: string;
  brands?: string | string[];
  nutriments?: OffNutriments;
  serving_quantity?: number | string;
  serving_size?: string;
  quantity?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  image_front_small_url?: string;
}

// search-a-licious: filtr "tylko Polska" – jeżeli serwer go odrzuci, wyłączamy go do końca sesji.
let countryFilterSupported = true;

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function brandText(b: OffProduct['brands']): string | undefined {
  if (!b) return undefined;
  const list = Array.isArray(b) ? b : b.split(',');
  const clean = list
    .map((x) => x.trim().replace(/^[a-z]{2}:/, ''))
    .filter(Boolean)
    .map((x) => (x.includes('-') && x === x.toLowerCase() ? x.replace(/-/g, ' ') : x))
    .map((x) => (x === x.toLowerCase() ? x.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : x));
  return clean.length ? [...new Set(clean)].slice(0, 2).join(', ') : undefined;
}

/** Zamienia produkt OFF na nasz format. Zwraca null, gdy brak podstawowych danych. */
export function offToFood(p: OffProduct): Food | null {
  const code = (p.code ?? '').trim();
  const name = (p.product_name_pl || p.product_name || p.product_name_en || '').trim();
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
    if (kj != null) kcal = kj / 4.184;
  }
  const protein = num(n.proteins_100g);
  const fat = num(n.fat_100g);
  const carbs = num(n.carbohydrates_100g);
  const fiber = num(n.fiber_100g) ?? 0;
  if (kcal == null && protein != null && fat != null && carbs != null) kcal = kcalFromMacros({ protein, fat, carbs, fiber });
  if (!name || kcal == null || !code) return null;

  const unitRaw = `${p.product_quantity_unit ?? ''} ${p.quantity ?? ''}`.toLowerCase();
  const isMl = /\bml\b|\bl\b|\bcl\b|litr/.test(unitRaw) && !/\bg\b|kg/.test(unitRaw);
  const unitLabel = isMl ? 'ml' : 'g';
  const portions: Portion[] = [];
  const serving = num(p.serving_quantity);
  if (serving && serving > 0 && serving < 5000) {
    const label = p.serving_size && p.serving_size.length < 30 ? `porcja (${p.serving_size.trim()})` : 'porcja';
    portions.push({ label, grams: round1(serving) });
  }
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq < 10000 && pq !== serving) portions.push({ label: `opakowanie ${round1(pq)} ${unitLabel}`, grams: round1(pq) });

  return {
    id: `off:${code}`,
    source: 'off',
    name,
    brand: brandText(p.brands),
    barcode: code,
    per100: {
      kcal: round1(kcal),
      protein: round1(protein ?? 0),
      fat: round1(fat ?? 0),
      carbs: round1(carbs ?? 0),
      fiber: round1(fiber),
    },
    portions,
    unit: isMl ? 'ml' : undefined,
    imageUrl: p.image_front_small_url,
  };
}

/** Usuwa znaki specjalne składni Lucene z zapytania użytkownika. */
export function sanitizeQuery(q: string): string {
  return q
    .replace(/[+\-!(){}[\]^"~*?:\\/&|]/g, ' ')
    .replace(/\b(AND|OR|NOT|TO)\b/g, (m) => m.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OffSearchResult {
  foods: Food[];
  count: number;
  fromCache: boolean;
}

async function fetchSearch(q: string, polandOnly: boolean, signal?: AbortSignal): Promise<{ hits: OffProduct[]; count: number } | 'bad-filter'> {
  if (!offSearchLimiter.tryTake()) throw new RateLimitedError(offSearchLimiter.waitMs(), 'Open Food Facts');
  const params = new URLSearchParams({
    q: polandOnly ? `${q} countries:"en:poland"` : q,
    langs: 'pl,en',
    page_size: '24',
    fields: SEARCH_FIELDS.join(','),
  });
  const res = await fetch(`${OFF_SEARCH_URL}?${params}`, { signal });
  if (polandOnly && (res.status === 400 || res.status === 422)) return 'bad-filter';
  if (res.status === 429 || res.status === 503) throw new RateLimitedError(60_000, 'Open Food Facts');
  if (!res.ok) throw new Error(`Open Food Facts: błąd ${res.status}`);
  const json = (await res.json()) as { hits?: OffProduct[]; count?: number };
  return { hits: Array.isArray(json.hits) ? json.hits : [], count: json.count ?? 0 };
}

export async function searchOFF(query: string, opts: { preferPoland: boolean; signal?: AbortSignal }): Promise<OffSearchResult> {
  const q = sanitizeQuery(query);
  if (q.length < 3) return { foods: [], count: 0, fromCache: false };
  const pl = opts.preferPoland && countryFilterSupported;
  const key = `off:s:${pl ? 'pl' : 'all'}:${normalize(q)}`;
  const cached = await cacheGet<{ foods: Food[]; count: number }>(key, SEARCH_TTL);
  if (cached) return { ...cached, fromCache: true };

  let r = await fetchSearch(q, pl, opts.signal);
  if (r === 'bad-filter') {
    countryFilterSupported = false;
    r = await fetchSearch(q, false, opts.signal);
  } else if (pl && r.hits.length === 0) {
    // Brak wyników z Polski – szukamy globalnie
    r = (await fetchSearch(q, false, opts.signal)) as { hits: OffProduct[]; count: number };
  }
  if (r === 'bad-filter') r = { hits: [], count: 0 };
  const seen = new Set<string>();
  const foods = r.hits
    .map(offToFood)
    .filter((f): f is Food => !!f && !seen.has(f.id) && !!seen.add(f.id));
  const out = { foods, count: r.count };
  await cacheSet(key, out);
  return { ...out, fromCache: false };
}

export function isValidBarcode(code: string): boolean {
  return /^\d{6,14}$/.test(code);
}

/**
 * Produkt po kodzie kreskowym. Zwraca null, jeżeli OFF go nie zna
 * (albo nie ma wartości odżywczych).
 */
export async function productByBarcode(code: string, signal?: AbortSignal): Promise<{ food: Food | null; incomplete?: OffProduct }> {
  const key = `off:p:${code}`;
  const cached = await cacheGet<{ food: Food | null; incomplete?: OffProduct }>(key, PRODUCT_TTL);
  if (cached && (cached.food || (await cacheGet(key, NOT_FOUND_TTL)))) return cached;
  if (!offProductLimiter.tryTake()) throw new RateLimitedError(offProductLimiter.waitMs(), 'Open Food Facts');
  const res = await fetch(`${OFF_PRODUCT_URL}${encodeURIComponent(code)}?fields=${PRODUCT_FIELDS.join(',')}`, { signal });
  if (res.status === 429 || res.status === 503) throw new RateLimitedError(60_000, 'Open Food Facts');
  if (res.status === 404) {
    const out = { food: null };
    await cacheSet(key, out);
    return out;
  }
  if (!res.ok) throw new Error(`Open Food Facts: błąd ${res.status}`);
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) {
    const out = { food: null };
    await cacheSet(key, out);
    return out;
  }
  const food = offToFood({ ...json.product, code: json.product.code || code });
  const out = food ? { food } : { food: null, incomplete: json.product };
  await cacheSet(key, out);
  return out;
}
