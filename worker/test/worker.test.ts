import { describe, expect, it, vi } from 'vitest';
import { createHandler, type Env } from '../src/index';
import { DEFAULT_MODEL_ACCURATE, DEFAULT_MODEL_FAST } from '../src/models';
import { isAllowedOrigin } from '../src/cors';
import { validateInput } from '../src/validate';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 1)]).toString('base64');

const env: Env = { GEMINI_API_KEY: 'test-key', ALLOWED_ORIGINS: 'https://ofc0urse.github.io' };
const ORIGIN = 'https://ofc0urse.github.io';

const okResult = {
  is_food: true,
  meal_name: 'Schabowy z ziemniakami',
  items: [
    { name: 'Kotlet schabowy', grams: 150, kcal: 398, protein: 27, fat: 22.5, carbs: 19.5, fiber: 1, confidence: 'high' },
    { name: 'Olej', grams: -5, kcal: 90, protein: 0, fat: 10, carbs: 0, fiber: 0, confidence: 'weird' },
  ],
  notes: 'Założono smażenie na oleju.',
};

/** Odpowiedź Gemini generateContent z JSON-em w części tekstowej. */
function geminiOk(obj: unknown, finishReason = 'STOP') {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(obj) }] }, finishReason }],
      modelVersion: 'gemini-3.5-flash-lite',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeHandler(impl: (url: string, init: RequestInit) => Promise<Response> = async () => geminiOk(okResult)) {
  const fetchMock = vi.fn(impl);
  const h = createHandler({ fetch: fetchMock as unknown as typeof fetch });
  return { h, fetchMock };
}

let ipSeq = 0;
function req(body: unknown, opts: { origin?: string | null; ip?: string; method?: string; path?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': opts.ip ?? `10.0.0.${++ipSeq}` };
  if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN;
  return new Request(`https://kalorie-ai.example.workers.dev${opts.path ?? '/estimate'}`, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.method === 'GET' || opts.method === 'OPTIONS' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('CORS', () => {
  it('dopuszcza GitHub Pages i localhost, odrzuca obce', () => {
    expect(isAllowedOrigin('https://ofc0urse.github.io', env.ALLOWED_ORIGINS)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', env.ALLOWED_ORIGINS)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173', env.ALLOWED_ORIGINS)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', env.ALLOWED_ORIGINS)).toBe(false);
    expect(isAllowedOrigin('https://ofc0urse.github.io.evil.example', env.ALLOWED_ORIGINS)).toBe(false);
    expect(isAllowedOrigin(null, env.ALLOWED_ORIGINS)).toBe(false);
  });
  it('preflight', async () => {
    const { h } = makeHandler();
    const ok = await h.fetch(req(null, { method: 'OPTIONS' }), env);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const bad = await h.fetch(req(null, { method: 'OPTIONS', origin: 'https://evil.example' }), env);
    expect(bad.status).toBe(403);
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
  it('POST z obcej domeny nie dociera do Gemini', async () => {
    const { h, fetchMock } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'jajecznica' }, { origin: 'https://evil.example' }), env);
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('walidacja', () => {
  it('odrzuca za duże zdjęcie', async () => {
    const { h } = makeHandler();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_600_000)]).toString('base64');
    expect((await h.fetch(req({ mode: 'photo', image: big }), env)).status).toBe(413);
  });
  it('rozpoznaje format po zawartości, nie po deklaracji', () => {
    expect(validateInput({ mode: 'photo', image: png, mediaType: 'image/jpeg' }).mediaType).toBe('image/png');
    expect(() => validateInput({ mode: 'photo', image: Buffer.alloc(2000, 65).toString('base64') })).toThrow(/JPEG, PNG, WebP/);
    expect(validateInput({ mode: 'photo', image: `data:image/jpeg;base64,${jpeg}` }).image).toBe(jpeg);
  });
  it('wymaga opisu w trybie tekstowym i limituje długość', () => {
    expect(() => validateInput({ mode: 'text', text: '' })).toThrow();
    expect(() => validateInput({ mode: 'text', text: 'x'.repeat(1001) })).toThrow(/1000/);
    expect(() => validateInput({ mode: 'video' })).toThrow();
    expect(validateInput({ mode: 'text', text: 'jabłko' }).quality).toBe('fast');
    expect(validateInput({ mode: 'text', text: 'jabłko', quality: 'accurate' }).quality).toBe('accurate');
  });
  it('nieprawidłowy JSON → 400', async () => {
    const { h } = makeHandler();
    expect((await h.fetch(req('{nope'), env)).status).toBe(400);
  });
});

describe('szacowanie przez Gemini', () => {
  it('wysyła zdjęcie, structured output i klucz w nagłówku; porządkuje wynik', async () => {
    const { h, fetchMock } = makeHandler();
    const r = await h.fetch(req({ mode: 'photo', image: jpeg, text: 'smażone na maśle' }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const data = (await r.json()) as typeof okResult;
    expect(data.items[0].name).toBe('Kotlet schabowy');
    expect(data.items[1].grams).toBe(0); // ujemne → 0
    expect(data.items[1].confidence).toBe('low');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL_FAST}:generateContent`);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(url).not.toContain('test-key'); // klucz nie w URL (logi)
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual(['is_food', 'meal_name', 'items', 'notes']);
    expect(body.generationConfig.responseSchema.properties.items.items.properties.confidence.enum).toEqual(['low', 'medium', 'high']);
    expect(body.systemInstruction.parts[0].text).toContain('dietetykiem');
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: jpeg } });
    expect(body.contents[0].parts[1].text).toContain('smażone na maśle');
  });
  it('„dokładniej” używa modelu Flash; modele można zmienić zmiennymi', async () => {
    const { h, fetchMock } = makeHandler();
    await h.fetch(req({ mode: 'text', text: 'dwie kanapki', quality: 'accurate' }), env);
    expect(fetchMock.mock.calls[0][0]).toContain(`/${DEFAULT_MODEL_ACCURATE}:generateContent`);
    await h.fetch(req({ mode: 'text', text: 'dwie kanapki' }), { ...env, MODEL_FAST: 'gemini-custom-lite' });
    expect(fetchMock.mock.calls[1][0]).toContain('/gemini-custom-lite:generateContent');
  });
  it('tryb opisu – bez obrazu', async () => {
    const { h, fetchMock } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'dwie kanapki z szynką i kawa z mlekiem' }), env);
    expect(r.status).toBe(200);
    const parts = JSON.parse(fetchMock.mock.calls[0][1].body as string).contents[0].parts;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain('dwie kanapki');
  });
  it('pomija części "thought" przy składaniu JSON-a', async () => {
    const { h } = makeHandler(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'myślę…', thought: true }, { text: JSON.stringify(okResult) }] }, finishReason: 'STOP' }] })),
    );
    const r = await h.fetch(req({ mode: 'text', text: 'schabowy' }), env);
    expect(r.status).toBe(200);
  });
  it('429 z darmowego pakietu → czytelny komunikat po polsku i Retry-After', async () => {
    const { h } = makeHandler(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'You exceeded your current quota',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }],
          },
        }),
        { status: 429 },
      ),
    );
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko', quality: 'accurate' }), env);
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('37');
    const { error } = (await r.json()) as { error: string };
    expect(error).toContain('Przekroczono limit darmowego pakietu Gemini');
    expect(error).toContain('37 s');
    expect(error).toContain('dokładniej');
  });
  it('nieprawidłowy klucz → 500 z podpowiedzią', async () => {
    const { h } = makeHandler(async () =>
      new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }), { status: 400 }),
    );
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), env);
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toContain('GEMINI_API_KEY');
  });
  it('blokada bezpieczeństwa → 422, obcięta odpowiedź → 502', async () => {
    let { h } = makeHandler(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    expect((await h.fetch(req({ mode: 'text', text: 'coś' }), env)).status).toBe(422);
    ({ h } = makeHandler(async () => geminiOk(okResult, 'MAX_TOKENS')));
    expect((await h.fetch(req({ mode: 'text', text: 'coś' }), env)).status).toBe(502);
  });
  it('503 → jedna ponowna próba', async () => {
    let n = 0;
    const { h, fetchMock } = makeHandler(async () => (++n === 1 ? new Response('{}', { status: 503 }) : geminiOk(okResult)));
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), env);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('brak klucza → 500 z czytelnym komunikatem', async () => {
    const { h } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), { ...env, GEMINI_API_KEY: '' });
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toContain('GEMINI_API_KEY');
  });
});

describe('limit zapytań', () => {
  it('11. zapytanie z tego samego IP w ciągu minuty → 429 (limiter w pamięci)', async () => {
    const { h } = makeHandler();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await h.fetch(req({ mode: 'text', text: 'jabłko' }, { ip: '192.168.1.50' }), env)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
  it('używa wiązania RATE_LIMITER Cloudflare, gdy jest', async () => {
    const { h, fetchMock } = makeHandler();
    const limit = vi.fn(async () => ({ success: false }));
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), { ...env, RATE_LIMITER: { limit } });
    expect(r.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: expect.stringMatching(/^10\.0\.0\./) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
