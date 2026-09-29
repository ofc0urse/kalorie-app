import { estimateMeal } from './gemini';
import { DEFAULT_MODEL_ACCURATE, DEFAULT_MODEL_FAST } from './models';
import { corsHeaders, isAllowedOrigin } from './cors';
import { HttpError, MAX_BODY_BYTES, validateInput } from './validate';

export interface Env {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS: string;
  /** domyślny model (szybki, tani) */
  MODEL_FAST?: string;
  /** model dla opcji „dokładniej” */
  MODEL_ACCURATE?: string;
  RATE_LIMITER?: RateLimit;
}


export interface Deps {
  fetch: typeof fetch;
}

// Zapasowy limiter w pamięci (gdy brak wiązania RATE_LIMITER, np. lokalnie) – 10 zapytań/min na IP.
const memoryHits = new Map<string, number[]>();
function memoryLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (memoryHits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (list.length >= max) {
    memoryHits.set(key, list);
    return false;
  }
  list.push(now);
  memoryHits.set(key, list);
  if (memoryHits.size > 5000) memoryHits.clear();
  return true;
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function createHandler(deps: Deps) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      const allowed = isAllowedOrigin(origin, env.ALLOWED_ORIGINS ?? '');
      const cors = allowed && origin ? corsHeaders(origin) : {};

      if (request.method === 'OPTIONS') {
        return allowed ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
      }
      if (url.pathname === '/health' && request.method === 'GET') {
        return json(
          { ok: true, configured: !!env.GEMINI_API_KEY, models: { fast: env.MODEL_FAST || DEFAULT_MODEL_FAST, accurate: env.MODEL_ACCURATE || DEFAULT_MODEL_ACCURATE } },
          200,
          cors,
        );
      }
      if (url.pathname !== '/estimate') return json({ error: 'Nie znaleziono.' }, 404, cors);
      if (request.method !== 'POST') return json({ error: 'Dozwolona metoda: POST.' }, 405, cors);
      // Obce strony nie mogą zużywać Twojego limitu Gemini.
      if (!allowed) return json({ error: 'Niedozwolone źródło żądania.' }, 403);

      try {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const ok = env.RATE_LIMITER ? (await env.RATE_LIMITER.limit({ key: ip })).success : memoryLimit(ip);
        if (!ok) throw new HttpError(429, 'Za dużo zapytań. Odczekaj minutę.', 60);

        const len = Number(request.headers.get('Content-Length') ?? '0');
        if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Żądanie jest za duże.');
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Żądanie jest za duże.');
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new HttpError(400, 'Nieprawidłowy JSON.');
        }
        const input = validateInput(body);
        if (!env.GEMINI_API_KEY) throw new HttpError(500, 'Backend nie ma ustawionego klucza GEMINI_API_KEY.');

        const accurate = input.quality === 'accurate';
        const model = accurate ? env.MODEL_ACCURATE || DEFAULT_MODEL_ACCURATE : env.MODEL_FAST || DEFAULT_MODEL_FAST;
        const result = await estimateMeal(input, { apiKey: env.GEMINI_API_KEY, model, accurate }, deps.fetch);
        return json(result, 200, cors);
      } catch (e) {
        if (e instanceof HttpError) {
          const extra: Record<string, string> = e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : {};
          return json({ error: e.message }, e.status, { ...cors, ...extra });
        }
        console.error('estimate failed', e);
        return json({ error: 'Nieoczekiwany błąd serwera.' }, 500, cors);
      }
    },
  };
}

export default createHandler({ fetch: (...args) => fetch(...args) }) satisfies ExportedHandler<Env>;
