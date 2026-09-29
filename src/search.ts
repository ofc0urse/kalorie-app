import { useEffect, useRef, useState } from 'preact/hooks';
import { RateLimitedError } from './api/rateLimit';
import { searchOFF } from './api/off';
import { searchUSDA } from './api/usda';
import { BASIC_FOODS } from './data/basicFoods';
import { allFoods, allRecipes, recentFoods } from './db/db';
import { recipeToFood } from './lib/nutrition';
import { matchScore } from './lib/text';
import type { Food } from './lib/types';

/** Wszystkie produkty dostępne offline: wbudowane, własne, zapisane z OFF/USDA, przepisy. */
export async function localPool(): Promise<{ foods: Food[]; usage: Map<string, number> }> {
  const [stored, recipes, recents] = await Promise.all([allFoods(), allRecipes(), recentFoods(200)]);
  const usage = new Map(recents.map((r) => [r.id, r.count]));
  const map = new Map<string, Food>();
  for (const f of BASIC_FOODS) map.set(f.id, f);
  for (const f of stored) map.set(f.id, f);
  for (const r of recipes) {
    const f = recipeToFood(r);
    map.set(f.id, f);
  }
  return { foods: [...map.values()], usage };
}

const SOURCE_BONUS: Record<Food['source'], number> = { custom: 12, recipe: 12, builtin: 6, off: 2, usda: 0, ai: 0 };

export function searchLocal(q: string, pool: Food[], usage?: Map<string, number>, limit = 60): Food[] {
  if (!q.trim()) return [];
  const scored: { f: Food; s: number }[] = [];
  for (const f of pool) {
    const hay = [f.name, ...(f.aliases ?? [])];
    let s = 0;
    for (const h of hay) s = Math.max(s, matchScore(h, q));
    if (f.brand) s = Math.max(s, matchScore(`${f.name} ${f.brand}`, q) - 5);
    if (f.barcode && f.barcode === q.trim()) s = 200;
    if (s <= 0) continue;
    s += SOURCE_BONUS[f.source] + Math.min(15, (usage?.get(f.id) ?? 0) * 3);
    scored.push({ f, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length)
    .slice(0, limit)
    .map((x) => x.f);
}

export type OnlineStatus = 'idle' | 'waiting' | 'loading' | 'done' | 'error' | 'limited' | 'offline';

export interface OnlineState {
  status: OnlineStatus;
  foods: Food[];
  message?: string;
  fromCache?: boolean;
}

/**
 * Wyszukiwanie w Open Food Facts z debounce – nie wysyłamy zapytania przy każdym znaku
 * (OFF wprost prosi, by nie robić "search-as-you-type").
 */
export function useOffSearch(query: string, preferPoland: boolean, enabled = true, debounceMs = 700): OnlineState & { retry: () => void } {
  const [state, setState] = useState<OnlineState>({ status: 'idle', foods: [] });
  const [nonce, setNonce] = useState(0);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    ctrl.current?.abort();
    const q = query.trim();
    if (!enabled || q.length < 3) {
      setState({ status: 'idle', foods: [] });
      return;
    }
    if (!navigator.onLine) {
      setState({ status: 'offline', foods: [], message: 'Brak internetu – pokazuję tylko produkty zapisane na urządzeniu.' });
      return;
    }
    setState((s) => ({ ...s, status: 'waiting' }));
    const c = new AbortController();
    ctrl.current = c;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, status: 'loading' }));
      try {
        const r = await searchOFF(q, { preferPoland, signal: c.signal });
        if (!c.signal.aborted) setState({ status: 'done', foods: r.foods, fromCache: r.fromCache });
      } catch (e) {
        if (c.signal.aborted || (e as Error).name === 'AbortError') return;
        if (e instanceof RateLimitedError) setState({ status: 'limited', foods: [], message: e.message });
        else setState({ status: 'error', foods: [], message: 'Nie udało się połączyć z Open Food Facts.' });
      }
    }, debounceMs);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [query, preferPoland, enabled, nonce]);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

export async function runUsdaSearch(query: string, apiKey: string): Promise<OnlineState> {
  if (!navigator.onLine) return { status: 'offline', foods: [], message: 'Brak internetu.' };
  try {
    const r = await searchUSDA(query, apiKey);
    return { status: 'done', foods: r.foods, fromCache: r.fromCache };
  } catch (e) {
    if (e instanceof RateLimitedError) return { status: 'limited', foods: [], message: e.message };
    return { status: 'error', foods: [], message: (e as Error).message || 'Błąd USDA.' };
  }
}
