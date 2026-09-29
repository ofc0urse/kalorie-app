export const MAX_BODY_BYTES = 2_500_000; // całe żądanie JSON
export const MAX_IMAGE_BYTES = 1_500_000; // zdekodowane zdjęcie (aplikacja wysyła ~100–300 kB)
export const MAX_TEXT_CHARS = 1000;

export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EstimateInput {
  mode: 'photo' | 'text';
  /** 'accurate' = Gemini Flash, domyślnie 'fast' = Flash-Lite */
  quality: 'fast' | 'accurate';
  image?: string;
  mediaType?: MediaType;
  text?: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** sekundy do ponowienia (nagłówek Retry-After) */
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Sprawdza "magiczne bajty" – czy to naprawdę JPEG/PNG/WebP. */
function sniff(b64: string): MediaType | null {
  const head = atob(b64.slice(0, 24));
  const b = [...head].map((c) => c.charCodeAt(0));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function validateInput(body: unknown): EstimateInput {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Nieprawidłowe dane żądania.');
  const b = body as Record<string, unknown>;
  const mode = b.mode;
  if (mode !== 'photo' && mode !== 'text') throw new HttpError(400, 'Pole "mode" musi mieć wartość "photo" albo "text".');
  const quality = b.quality === 'accurate' ? 'accurate' : 'fast';
  const text = typeof b.text === 'string' ? b.text.trim() : undefined;
  if (text && text.length > MAX_TEXT_CHARS) throw new HttpError(400, `Opis może mieć najwyżej ${MAX_TEXT_CHARS} znaków.`);

  if (mode === 'text') {
    if (!text || text.length < 3) throw new HttpError(400, 'Opisz posiłek (co najmniej 3 znaki).');
    return { mode, quality, text };
  }

  let image = typeof b.image === 'string' ? b.image : '';
  const dataUrl = /^data:(image\/[a-z]+);base64,/.exec(image);
  if (dataUrl) image = image.slice(dataUrl[0].length);
  if (!image) throw new HttpError(400, 'Brak zdjęcia.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new HttpError(400, 'Zdjęcie musi być zakodowane w base64.');
  const bytes = base64Bytes(image);
  if (bytes > MAX_IMAGE_BYTES) throw new HttpError(413, `Zdjęcie jest za duże (${Math.round(bytes / 1024)} kB, limit ${Math.round(MAX_IMAGE_BYTES / 1024)} kB).`);
  if (bytes < 500) throw new HttpError(400, 'Zdjęcie jest za małe lub uszkodzone.');
  const detected = sniff(image);
  if (!detected) throw new HttpError(415, 'Obsługiwane formaty zdjęć: JPEG, PNG, WebP.');
  return { mode, quality, image, mediaType: detected, text };
}
