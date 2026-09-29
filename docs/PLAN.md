# Plan i architektura

## Założenia
- **PWA** hostowana na GitHub Pages (`https://<użytkownik>.github.io/kalorie-app/`), instalowana na iPhonie przez „Do ekranu początkowego”.
- **Bez kont** – wszystkie dane w IndexedDB na urządzeniu, eksport/import JSON.
- **Backend tylko do AI** – Cloudflare Worker (`/worker`) trzyma klucz Claude API jako secret.

## Stack
| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Build | Vite + TypeScript | szybki build, statyczne pliki pod GitHub Pages |
| UI | Preact (3 kB) + własny CSS | komponenty jak w React, bez ciężkiego frameworka |
| Dane | IndexedDB przez `idb` (1 kB) | trwałe, duże, działa offline w Safari |
| Offline | `vite-plugin-pwa` (Workbox) | precache całej aplikacji + manifest |
| Skaner | `@zxing/library` (npm, wbudowany w bundle) | Safari nie ma `BarcodeDetector`; brak CDN |
| AI | Cloudflare Worker + `@anthropic-ai/sdk` | klucz API poza frontendem, CORS, limity |
| Testy | Vitest (logika) + Playwright (widok iPhone'a, zamockowane API) | |

## Moduły frontendu (`src/`)
- `lib/` – czysta logika: wartości odżywcze, normalizacja tekstu (wyszukiwanie bez polskich znaków), Mifflin-St Jeor, daty, kopia zapasowa.
- `db/` – schemat IndexedDB: `entries` (dziennik, indeks po dacie), `foods` (własne i zapisane produkty, indeks po kodzie kreskowym), `recipes`, `favorites`, `recents`, `weights`, `water`, `kv` (ustawienia), `cache` (odpowiedzi API z czasem życia).
- `api/` – klienci Open Food Facts (wyszukiwarka search-a-licious + API v2 produktu), USDA FDC, backend AI; limity zapytań i cache.
- `data/` – wbudowana baza ok. 300 produktów (wartości na 100 g + typowe porcje).
- `views/` – ekrany: Dziennik, Dodaj, Skaner, AI, Produkty/Przepisy, Statystyki, Ustawienia.
- `ui/` – komponenty (arkusz, pola liczbowe, wykresy SVG, toast z „Cofnij”).

Wpis w dzienniku przechowuje **kopię produktu** z chwili dodania – późniejsza edycja produktu nie zmienia historii.

## Zewnętrzne API (sprawdzone w dokumentacji/źródłach)
- **Open Food Facts – wyszukiwanie:** `GET https://search.openfoodfacts.org/search?q=…&langs=pl,en&page_size=…&fields=…` (search-a-licious; odpowiedź `{hits, count, page, page_size, page_count}`; pola tekstowe spłaszczone do `product_name`, `product_name_pl` itd.).
- **Open Food Facts – produkt:** `GET https://world.openfoodfacts.org/api/v2/product/{kod}?fields=…` (`status: 1` = znaleziono). Limity OFF: 15 zapytań/min o produkt i 10/min wyszukiwań na użytkownika – aplikacja ma własny ogranicznik, debounce 700 ms, minimum 3 znaki i cache w IndexedDB.
- **USDA FoodData Central:** `GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=…&query=…&dataType=Foundation,SR Legacy` – `foodNutrients[]` z `nutrientNumber` (208 kcal, 203 białko, 204 tłuszcz, 205 węglowodany, 291 błonnik). Klucz własny albo `DEMO_KEY`.
- **Claude API:** Messages API z obrazem base64 i strukturalnym wyjściem JSON (`output_config.format`), model `claude-opus-5-5`.

## Etapy (wszystkie zrealizowane)
1. Dziennik (posiłki, podsumowanie, nawigacja po dniach, woda, waga, cofanie, kopiowanie, statystyki, cel i ustawienia, kopia JSON).
2. Baza produktów (wbudowana, OFF, USDA, własne, przepisy, ulubione, ostatnie).
3. Skaner kodów kreskowych (ZXing, ręczny kod, dodawanie brakującego produktu).
4. Zdjęcie/opis → AI przez Cloudflare Workera.
5. Dopracowanie wyglądu, README.

## Decyzje i założenia
- Węglowodany wszędzie jako przyswajalne (bez błonnika) – jak na etykietach w UE; wartości z USDA są przeliczane.
- Kody kreskowe normalizowane jak w Open Food Facts (UPC-A → EAN-13 z wiodącym zerem).
- Wyszukiwanie w OFF z preferencją produktów z Polski (`countries:"en:poland"`); gdy brak wyników – wyszukiwanie globalne.
- USDA tylko na żądanie (przycisk) – oszczędza limit `DEMO_KEY`.
- Model AI: `claude-opus-5-5` z adaptive thinking i `effort: medium`; można zmienić w `worker/wrangler.toml`.
