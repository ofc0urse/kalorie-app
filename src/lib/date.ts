/** Daty w formacie YYYY-MM-DD w czasie lokalnym. */

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function today(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function rangeKeys(endKey: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const WEEKDAYS_SHORT = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const MONTHS_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];

export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[fromKey(key).getDay()];
}

export function formatDayLabel(key: string, now = today()): string {
  if (key === now) return 'Dzisiaj';
  if (key === addDays(now, -1)) return 'Wczoraj';
  if (key === addDays(now, 1)) return 'Jutro';
  const d = fromKey(key);
  const base = `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === fromKey(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
