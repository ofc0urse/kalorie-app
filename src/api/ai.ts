export interface AiItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface AiEstimate {
  is_food: boolean;
  meal_name: string;
  items: AiItem[];
  notes: string;
  model?: string;
}

export class AiError extends Error {}

/** Wywołuje backend (Cloudflare Worker). Klucz Gemini API jest tylko w Workerze. */
export async function estimateWithAi(
  endpoint: string,
  payload: { mode: 'photo'; image: string; text?: string } | { mode: 'text'; text: string },
  quality: 'fast' | 'accurate' = 'fast',
  signal?: AbortSignal,
): Promise<AiEstimate> {
  if (!endpoint) throw new AiError('Nie ustawiono adresu backendu AI. Wpisz go w Ustawieniach → Źródła danych i AI.');
  if (!navigator.onLine) throw new AiError('Brak internetu – szacowanie AI wymaga połączenia.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(`${endpoint.replace(/\/+$/, '')}/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, quality }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError(signal?.aborted ? 'Anulowano.' : 'Przekroczono czas oczekiwania na odpowiedź AI.');
    throw new AiError('Nie można połączyć się z backendem AI. Sprawdź adres w Ustawieniach.');
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* brak JSON */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new AiError(msg || `Błąd backendu AI (${res.status}).`);
  }
  const d = data as AiEstimate;
  if (!d || !Array.isArray(d.items)) throw new AiError('Nieprawidłowa odpowiedź backendu AI.');
  return d;
}
