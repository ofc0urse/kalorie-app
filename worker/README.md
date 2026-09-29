# kalorie-ai – backend AI (Cloudflare Worker)

Mały backend dla aplikacji Kalorie: przyjmuje zdjęcie (base64) albo opis posiłku i zwraca listę składników z oszacowaną wagą, kaloriami i makro. Korzysta z Gemini API (Google AI Studio) ze structured output (`responseMimeType` + `responseSchema`). Domyślny model: `gemini-3.5-flash-lite`, opcja „dokładniej” (`"quality":"accurate"`): `gemini-3.8-flash`.

- `POST /estimate` – `{"mode":"photo","image":"<base64 JPEG/PNG/WebP>","text":"opcjonalny kontekst","quality":"fast"}` albo `{"mode":"text","text":"opis posiłku","quality":"accurate"}`
- `GET /health` – sprawdzenie konfiguracji

Bezpieczeństwo: klucz tylko jako secret `GEMINI_API_KEY`, CORS tylko dla `ALLOWED_ORIGINS` i localhost, limit 10 zapytań/min na IP, walidacja rozmiaru i formatu zdjęcia.

Przekroczenie limitu darmowego pakietu (HTTP 429) zwraca komunikat po polsku i nagłówek `Retry-After`.

Instrukcja wdrożenia krok po kroku: [README główne → „Wdrożenie backendu AI”](../README.md#2-wdrożenie-backendu-ai-cloudflare-worker--gemini-api-krok-po-kroku).

```bash
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
npm test
```
