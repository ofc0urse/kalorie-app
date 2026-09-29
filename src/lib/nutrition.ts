import type { Entry, Food, Nutrients, Recipe } from './types';

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };

export const NUTRIENT_KEYS: (keyof Nutrients)[] = ['kcal', 'protein', 'fat', 'carbs', 'fiber'];

export function scale(per100: Nutrients, grams: number): Nutrients {
  const f = (Number.isFinite(grams) ? grams : 0) / 100;
  return {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    fat: per100.fat * f,
    carbs: per100.carbs * f,
    fiber: per100.fiber * f,
  };
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    carbs: a.carbs + b.carbs,
    fiber: a.fiber + b.fiber,
  };
}

export function entryNutrients(e: Pick<Entry, 'food' | 'grams'>): Nutrients {
  return scale(e.food.per100, e.grams);
}

export function sumEntries(entries: Pick<Entry, 'food' | 'grams'>[]): Nutrients {
  return entries.reduce((acc, e) => add(acc, entryNutrients(e)), { ...ZERO });
}

/** Zamienia wartości dla danej wagi na wartości na 100 g. */
export function toPer100(n: Nutrients, grams: number): Nutrients {
  if (!grams || grams <= 0) return { ...ZERO };
  const f = 100 / grams;
  return {
    kcal: n.kcal * f,
    protein: n.protein * f,
    fat: n.fat * f,
    carbs: n.carbs * f,
    fiber: n.fiber * f,
  };
}

export function sanitizeNutrients(n: Partial<Nutrients> | undefined | null): Nutrients {
  const v = (x: unknown) => {
    const num = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : Number(x);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  };
  return {
    kcal: v(n?.kcal),
    protein: v(n?.protein),
    fat: v(n?.fat),
    carbs: v(n?.carbs),
    fiber: v(n?.fiber),
  };
}

/** Energia z makro (Atwater) – przydatne, gdy źródło nie podaje kcal. */
export function kcalFromMacros(n: Pick<Nutrients, 'protein' | 'fat' | 'carbs' | 'fiber'>): number {
  return n.protein * 4 + n.fat * 9 + Math.max(0, n.carbs) * 4 + n.fiber * 2;
}

export function recipeTotals(r: Pick<Recipe, 'ingredients'>): Nutrients {
  return r.ingredients.reduce((acc, i) => add(acc, scale(i.food.per100, i.grams)), { ...ZERO });
}

/** Tworzy "produkt" z przepisu, żeby dodawać go do dziennika jak zwykły produkt. */
export function recipeToFood(r: Recipe): Food {
  const totals = recipeTotals(r);
  const rawSum = r.ingredients.reduce((s, i) => s + i.grams, 0);
  const total = r.totalGrams > 0 ? r.totalGrams : rawSum;
  const servings = Math.max(1, r.servings || 1);
  return {
    id: `recipe:${r.id}`,
    source: 'recipe',
    name: r.name,
    per100: toPer100(totals, total),
    portions: [
      { label: 'porcja', grams: round1(total / servings) },
      ...(servings > 1 ? [{ label: 'całość', grams: round1(total) }] : []),
    ],
  };
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

export function fmt0(x: number): string {
  return nf0.format(Math.round(x) === 0 ? 0 : x);
}

export function fmt1(x: number): string {
  return nf1.format(Math.abs(x) < 0.05 ? 0 : x);
}

/** Parsuje liczbę z polskim przecinkiem. Zwraca NaN, gdy się nie da. */
export function parseNum(s: string | number | undefined | null): number {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
}
