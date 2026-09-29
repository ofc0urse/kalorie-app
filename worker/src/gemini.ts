import { RESPONSE_SCHEMA, type Estimate } from './schema';
import { SYSTEM_PROMPT, userText } from './prompt';
import { HttpError, type EstimateInput } from './validate';

export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** true = tryb "dokładniej" (Gemini Flash) */
  accurate: boolean;
}

type Fetch = typeof fetch;

interface GeminiError {
  error?: { code?: number; message?: string; status?: string; details?: { '@type'?: string; reason?: string; retryDelay?: string }[] };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
}

const num = (x: unknown, max: number) => {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : Number(x);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 10) / 10)) : 0;
};

/** Porządkuje liczby z modelu (bez ujemnych, bez absurdalnych wartości). */
export function sanitizeEstimate(raw: unknown): Estimate {
  const e = (raw ?? {}) as Partial<Estimate>;
  return {
    is_food: e.is_food !== false,
    meal_name: String(e.meal_name ?? '').slice(0, 120),
    notes: String(e.notes ?? '').slice(0, 600),
    items: (Array.isArray(e.items) ? e.items : []).slice(0, 25).map((i) => ({
      name: String(i?.name ?? 'Składnik').slice(0, 80),
      grams: num(i?.grams, 3000),
      kcal: num(i?.kcal, 5000),
      protein: num(i?.protein, 500),
      fat: num(i?.fat, 500),
      carbs: num(i?.carbs, 1000),
      fiber: num(i?.fiber, 200),
      confidence: i?.confidence === 'high' || i?.confidence === 'medium' ? i.confidence : 'low',
    })),
  };
}

/** "37s" / "1.5s" → sekundy */
function retrySeconds(err: GeminiError): number | undefined {
  const d = err.error?.details?.find((x) => x.retryDelay)?.retryDelay;
  const s = d ? parseFloat(d) : NaN;
  return Number.isFinite(s) ? Math.ceil(s) : undefined;
}

async function mapError(res: Response, cfg: GeminiConfig): Promise<HttpError> {
  let body: GeminiError = {};
  try {
    body = (await res.json()) as GeminiError;
  } catch {
    /* brak JSON */
  }
  const reason = body.error?.details?.find((d) => d.reason)?.reason;
  if (res.status === 429) {
    const wait = retrySeconds(body);
    const when = wait ? `Spróbuj ponownie za ok. ${wait} s` : 'Spróbuj ponownie za minutę';
    const hint = cfg.accurate
      ? ' Tryb „dokładniej” (Gemini Flash) ma niższe limity – możesz go wyłączyć w Ustawieniach.'
      : ' Jeśli wyczerpał się limit dzienny, odnowi się jutro.';
    return new HttpError(429, `Przekroczono limit darmowego pakietu Gemini. ${when}.${hint}`, wait);
  }
  if (reason === 'API_KEY_INVALID' || res.status === 401 || res.status === 403) {
    return new HttpError(500, 'Błąd konfiguracji backendu: nieprawidłowy klucz Gemini. Sprawdź secret GEMINI_API_KEY.');
  }
  if (res.status === 404) return new HttpError(500, `Model „${cfg.model}” jest niedostępny. Zmień MODEL_FAST / MODEL_ACCURATE w wrangler.toml.`);
  if (res.status === 400) return new HttpError(400, 'Gemini odrzucił żądanie (np. nieobsługiwane zdjęcie).');
  if (res.status === 503 || res.status === 500) return new HttpError(503, 'Usługa Gemini jest chwilowo przeciążona. Spróbuj za chwilę.');
  return new HttpError(502, `Błąd usługi Gemini (${res.status}).`);
}

export async function estimateMeal(input: EstimateInput, cfg: GeminiConfig, fetchFn: Fetch = fetch): Promise<Estimate & { model: string }> {
  const parts: Record<string, unknown>[] = [];
  if (input.mode === 'photo' && input.image && input.mediaType) {
    parts.push({ inlineData: { mimeType: input.mediaType, data: input.image } });
  }
  parts.push({ text: userText(input.mode, input.text) });

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 8192,
    },
  });

  let res: Response | null = null;
  // jedna ponowna próba przy chwilowym przeciążeniu (503)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchFn(`${GEMINI_API}/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body,
      });
    } catch {
      throw new HttpError(502, 'Brak połączenia z usługą Gemini.');
    }
    if (res.status !== 503 || attempt === 1) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!res!.ok) throw await mapError(res!, cfg);

  const data = (await res!.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) throw new HttpError(422, 'Gemini odmówił analizy tego zdjęcia/opisu.');
  const cand = data.candidates?.[0];
  const reason = cand?.finishReason;
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || reason === 'BLOCKLIST' || reason === 'RECITATION') {
    throw new HttpError(422, 'Gemini odmówił analizy tego zdjęcia/opisu.');
  }
  if (reason === 'MAX_TOKENS') throw new HttpError(502, 'Odpowiedź modelu była niekompletna. Spróbuj ponownie.');
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(502, 'Nie udało się odczytać odpowiedzi modelu.');
  }
  return { ...sanitizeEstimate(parsed), model: data.modelVersion || cfg.model };
}
