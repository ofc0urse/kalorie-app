import Anthropic from '@anthropic-ai/sdk';
import { estimateMeal, type ClaudeClient } from './claude';
import { corsHeaders, isAllowedOrigin } from './cors';
import { HttpError, MAX_BODY_BYTES, validateInput } from './validate';

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGINS: string;
  MODEL?: string;
  EFFORT?: string;
  RATE_LIMITER?: RateLimit;
}

export interface Deps {
  createClient: (env: Env) => ClaudeClient;
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
        return json({ ok: true, configured: !!env.ANTHROPIC_API_KEY }, 200, cors);
      }
      if (url.pathname !== '/estimate') return json({ error: 'Nie znaleziono.' }, 404, cors);
      if (request.method !== 'POST') return json({ error: 'Dozwolona metoda: POST.' }, 405, cors);
      // Blokujemy wywołania z obcych stron (przeglądarka i tak zablokowałaby odpowiedź bez CORS,
      // ale nie chcemy nawet wydawać pieniędzy na takie zapytania).
      if (!allowed) return json({ error: 'Niedozwolone źródło żądania.' }, 403);

      try {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const ok = env.RATE_LIMITER ? (await env.RATE_LIMITER.limit({ key: ip })).success : memoryLimit(ip);
        if (!ok) throw new HttpError(429, 'Za dużo zapytań. Odczekaj minutę.');

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
        if (!env.ANTHROPIC_API_KEY) throw new HttpError(500, 'Backend nie ma ustawionego klucza ANTHROPIC_API_KEY.');

        const effort = env.EFFORT === 'low' || env.EFFORT === 'high' ? env.EFFORT : 'medium';
        const result = await estimateMeal(deps.createClient(env), input, { model: env.MODEL || 'claude-opus-5-5', effort });
        return json(result, 200, cors);
      } catch (e) {
        if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
        console.error('estimate failed', e);
        return json({ error: 'Nieoczekiwany błąd serwera.' }, 500, cors);
      }
    },
  };
}

export default createHandler({
  createClient: (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 }),
}) satisfies ExportedHandler<Env>;
