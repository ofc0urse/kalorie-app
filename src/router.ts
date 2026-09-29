import { Store } from './lib/store';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', params: new URLSearchParams(qs ?? '') };
}

export const routeStore = new Store<Route>(parse());

const sync = () => {
  const prev = routeStore.get().path;
  const next = parse();
  routeStore.set(next);
  if (next.path !== prev) window.scrollTo(0, 0);
};
window.addEventListener('popstate', sync);
window.addEventListener('hashchange', sync);

function currentIdx(): number {
  const s = history.state as { idx?: number } | null;
  return typeof s?.idx === 'number' ? s.idx : 0;
}

export function buildHash(path: string, params?: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== '') qs.set(k, String(v));
  const q = qs.toString();
  return `#${path}${q ? `?${q}` : ''}`;
}

export function navigate(path: string, params?: Record<string, string | number | undefined | null>, replace = false): void {
  const hash = buildHash(path, params);
  if (replace) history.replaceState({ idx: currentIdx() }, '', hash);
  else history.pushState({ idx: currentIdx() + 1 }, '', hash);
  sync();
}

/** Wstecz w obrębie aplikacji; gdy nie ma dokąd wrócić – przejście do `fallback`. */
export function goBack(fallback = '/'): void {
  if (currentIdx() > 0) history.back();
  else navigate(fallback, undefined, true);
}
