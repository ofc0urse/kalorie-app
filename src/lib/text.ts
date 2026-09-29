/**
 * Normalizacja tekstu do wyszukiwania: małe litery, bez polskich znaków i diakrytyków.
 * Uwaga: "ł" nie rozkłada się w NFD, więc trzeba go zamienić ręcznie.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/**
 * Ocena dopasowania nazwy do zapytania (0 = brak). Wszystkie słowa zapytania muszą pasować
 * (jako początek słowa albo fragment). Wyżej punktowane: dokładne dopasowanie, początek nazwy,
 * początek słowa, krótsze nazwy.
 */
export function matchScore(haystack: string, query: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const h = normalize(haystack);
  if (!h) return 0;
  const words = h.split(' ');
  let score = 0;
  for (const t of q) {
    if (words.includes(t)) score += 30;
    else if (words.some((w) => w.startsWith(t))) score += 20;
    else if (h.includes(t)) score += 8;
    else return 0;
  }
  const qn = q.join(' ');
  if (h === qn) score += 100;
  else if (h.startsWith(qn)) score += 40;
  score -= Math.min(20, words.length * 1.5);
  return score;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
