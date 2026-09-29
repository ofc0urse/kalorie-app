# kalorie-ai – backend AI (Cloudflare Worker)

Mały backend dla aplikacji Kalorie: przyjmuje zdjęcie (base64) albo opis posiłku i zwraca listę składników z oszacowaną wagą, kaloriami i makro. Korzysta z Claude API (structured outputs).

- `POST /estimate` – `{"mode":"photo","image":"<base64 JPEG/PNG/WebP>","text":"opcjonalny kontekst"}` albo `{"mode":"text","text":"opis posiłku"}`
- `GET /health` – sprawdzenie konfiguracji

Bezpieczeństwo: klucz tylko jako secret `ANTHROPIC_API_KEY`, CORS tylko dla `ALLOWED_ORIGINS` i localhost, limit 10 zapytań/min na IP, walidacja rozmiaru i formatu zdjęcia.

Instrukcja wdrożenia krok po kroku: [README główne → „Wdrożenie backendu AI”](../README.md#2-wdrożenie-backendu-ai-cloudflare-worker-krok-po-kroku).

```bash
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
npm test
```
