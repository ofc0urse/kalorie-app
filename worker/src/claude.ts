import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { EstimateSchema, type Estimate } from './schema';
import { SYSTEM_PROMPT, userText } from './prompt';
import { HttpError, type EstimateInput } from './validate';

export type ClaudeClient = Pick<Anthropic, 'beta'>;

export interface ClaudeConfig {
  model: string;
  effort: 'low' | 'medium' | 'high';
}

const num = (x: unknown, max: number) => {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : 0;
  return Math.min(max, Math.max(0, Math.round(n * 10) / 10));
};

/** Porządkuje liczby z modelu (bez ujemnych, bez absurdalnych wartości). */
export function sanitizeEstimate(e: Estimate): Estimate {
  return {
    is_food: !!e.is_food,
    meal_name: String(e.meal_name ?? '').slice(0, 120),
    notes: String(e.notes ?? '').slice(0, 600),
    items: (e.items ?? []).slice(0, 25).map((i) => ({
      name: String(i.name ?? 'Składnik').slice(0, 80),
      grams: num(i.grams, 3000),
      kcal: num(i.kcal, 5000),
      protein: num(i.protein, 500),
      fat: num(i.fat, 500),
      carbs: num(i.carbs, 1000),
      fiber: num(i.fiber, 200),
      confidence: i.confidence === 'high' || i.confidence === 'medium' ? i.confidence : 'low',
    })),
  };
}

export async function estimateMeal(client: ClaudeClient, input: EstimateInput, cfg: ClaudeConfig): Promise<Estimate & { model: string }> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.mode === 'photo' && input.image && input.mediaType) {
    content.push({ type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.image } });
  }
  content.push({ type: 'text', text: userText(input.mode, input.text) });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: cfg.model,
      max_tokens: 8000,
      // Gdy filtr bezpieczeństwa odrzuci żądanie, API samo powtórzy je na zalecanym modelu zapasowym.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: cfg.effort, format: betaZodOutputFormat(EstimateSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, 'Usługa AI jest chwilowo przeciążona. Spróbuj za chwilę.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw new HttpError(500, 'Błąd konfiguracji backendu (klucz API). Sprawdź secret ANTHROPIC_API_KEY.');
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, 'Model odrzucił żądanie (np. nieobsługiwane zdjęcie).');
    if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'Brak połączenia z usługą AI.');
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Błąd usługi AI (${e.status ?? '?'}).`);
    throw e;
  }

  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Model odmówił analizy tego zdjęcia/opisu.');
  if (response.stop_reason === 'max_tokens') throw new HttpError(502, 'Odpowiedź modelu była niekompletna. Spróbuj ponownie.');
  const parsed = response.parsed_output;
  if (!parsed) throw new HttpError(502, 'Nie udało się odczytać odpowiedzi modelu.');
  return { ...sanitizeEstimate(parsed), model: response.model };
}
