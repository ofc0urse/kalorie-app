import { describe, expect, it, vi } from 'vitest';
import { createHandler, type Env } from '../src/index';
import { isAllowedOrigin } from '../src/cors';
import { validateInput } from '../src/validate';

// minimalny poprawny JPEG (nagłówek + wypełnienie) w base64
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 1)]).toString('base64');

const env: Env = { ANTHROPIC_API_KEY: 'test-key', ALLOWED_ORIGINS: 'https://ofc0urse.github.io', MODEL: 'claude-opus-5-5' };
const ORIGIN = 'https://ofc0urse.github.io';

const okResult = {
  is_food: true,
  meal_name: 'Schabowy z ziemniakami',
  notes: 'Założono smażenie na oleju.',
  items: [
    { name: 'Kotlet schabowy', grams: 150, kcal: 398, protein: 27, fat: 22.5, carbs: 19.5, fiber: 1, confidence: 'high' },
    { name: 'Olej', grams: -5, kcal: 90, protein: 0, fat: 10, carbs: 0, fiber: 0, confidence: 'weird' },
  ],
};

function makeHandler(parse: ReturnType<typeof vi.fn> = vi.fn(async (_p: unknown) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", parsed_output: okResult as unknown }))) {
  const h = createHandler({ createClient: () => ({ beta: { messages: { parse } } }) as never });
  return { h, parse };
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
  it('POST z obcej domeny nie dociera do Claude', async () => {
    const { h, parse } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'jajecznica' }, { origin: 'https://evil.example' }), env);
    expect(r.status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe('walidacja', () => {
  it('odrzuca za duże zdjęcie', async () => {
    const { h } = makeHandler();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_600_000)]).toString('base64');
    const r = await h.fetch(req({ mode: 'photo', image: big }), env);
    expect(r.status).toBe(413);
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
  });
  it('nieprawidłowy JSON → 400', async () => {
    const { h } = makeHandler();
    const r = await h.fetch(req('{nope'), env);
    expect(r.status).toBe(400);
  });
});

describe('szacowanie', () => {
  it('wysyła zdjęcie i schemat do Claude, porządkuje wynik', async () => {
    const { h, parse } = makeHandler();
    const r = await h.fetch(req({ mode: 'photo', image: jpeg, text: 'smażone na maśle' }), env);
    expect(r.status).toBe(200);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const data = (await r.json()) as typeof okResult;
    expect(data.items[0].name).toBe('Kotlet schabowy');
    expect(data.items[1].grams).toBe(0); // ujemne → 0
    expect(data.items[1].confidence).toBe('low');
    const params = parse.mock.calls[0][0] as Record<string, any>;
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.effort).toBe('medium');
    expect(params.fallbacks).toBe('default');
    const content = params.messages[0].content;
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } });
    expect(content[1].text).toContain('smażone na maśle');
  });
  it('tryb opisu – bez obrazu', async () => {
    const { h, parse } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'dwie kanapki z szynką i kawa z mlekiem' }), env);
    expect(r.status).toBe(200);
    const content = (parse.mock.calls[0][0] as any).messages[0].content;
    expect(content).toHaveLength(1);
    expect(content[0].text).toContain('dwie kanapki');
  });
  it('odmowa modelu → 422', async () => {
    const { h } = makeHandler(vi.fn(async () => ({ stop_reason: 'refusal', model: 'x', parsed_output: null })));
    const r = await h.fetch(req({ mode: 'text', text: 'coś' }), env);
    expect(r.status).toBe(422);
  });
  it('brak klucza → 500 z czytelnym komunikatem', async () => {
    const { h } = makeHandler();
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), { ...env, ANTHROPIC_API_KEY: '' });
    expect(r.status).toBe(500);
    expect(((await r.json()) as { error: string }).error).toContain('ANTHROPIC_API_KEY');
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
    const { h, parse } = makeHandler();
    const limit = vi.fn(async () => ({ success: false }));
    const r = await h.fetch(req({ mode: 'text', text: 'jabłko' }), { ...env, RATE_LIMITER: { limit } });
    expect(r.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: expect.stringMatching(/^10\.0\.0\./) });
    expect(parse).not.toHaveBeenCalled();
  });
});
