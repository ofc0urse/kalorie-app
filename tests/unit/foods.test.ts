import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BASIC_FOODS } from '../../src/data/basicFoods';
import { kcalFromMacros } from '../../src/lib/nutrition';
import { searchLocal } from '../../src/search';
import { offToFood, sanitizeQuery, searchOFF, productByBarcode } from '../../src/api/off';
import { usdaToFood, searchUSDA } from '../../src/api/usda';
import { RateLimiter } from '../../src/api/rateLimit';
import { resetDBForTests, DB_NAME } from '../../src/db/db';

describe('wbudowana baza', () => {
  it('ma ok. 300 produktów z unikalnymi id', () => {
    expect(BASIC_FOODS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(BASIC_FOODS.map((f) => f.id)).size).toBe(BASIC_FOODS.length);
  });
  it('wartości są spójne (kcal ≈ makro, bez alkoholu)', () => {
    const alcohol = /piwo|wino|wódka/i;
    for (const f of BASIC_FOODS) {
      const { kcal, protein, fat, carbs, fiber } = f.per100;
      expect(protein + fat + carbs + fiber, f.name).toBeLessThanOrEqual(101);
      if (alcohol.test(f.name) || kcal < 20) continue;
      const est = kcalFromMacros(f.per100);
      expect(Math.abs(est - kcal) / kcal, `${f.name}: ${kcal} vs ${est.toFixed(0)}`).toBeLessThan(0.2);
    }
  });
  it('porcje mają dodatnią wagę', () => {
    for (const f of BASIC_FOODS) for (const p of f.portions) expect(p.grams, f.name).toBeGreaterThan(0);
  });
  it('wyszukiwanie bez polskich znaków', () => {
    const r = searchLocal('jablko', BASIC_FOODS);
    expect(r[0].name).toBe('Jabłko');
    expect(searchLocal('zolty ser', BASIC_FOODS).some((f) => f.name.startsWith('Ser'))).toBe(true);
    expect(searchLocal('kartofle', BASIC_FOODS)[0].name).toMatch(/Ziemniaki/);
    expect(searchLocal('losos', BASIC_FOODS)[0].name).toMatch(/Łosoś/);
    expect(searchLocal('schabowy', BASIC_FOODS)[0].name).toBe('Kotlet schabowy panierowany');
    expect(searchLocal('owsiane', BASIC_FOODS)[0].name).toBe('Płatki owsiane');
    expect(searchLocal('mleko', BASIC_FOODS)[0].name).toMatch(/^Mleko/);
  });
});

describe('Open Food Facts', () => {
  it('mapuje produkt (kcal, porcje, ml)', () => {
    const f = offToFood({
      code: '5900259000002',
      product_name: 'Woda',
      product_name_pl: 'Sok jabłkowy',
      brands: 'Tymbark,Maspex',
      nutriments: { 'energy-kcal_100g': 44, proteins_100g: 0.1, fat_100g: 0, carbohydrates_100g: '10,5', fiber_100g: 0.2 },
      serving_quantity: 250,
      serving_size: '250 ml',
      quantity: '1 l',
      product_quantity: 1000,
      product_quantity_unit: 'ml',
    })!;
    expect(f.id).toBe('off:5900259000002');
    expect(f.name).toBe('Sok jabłkowy');
    expect(f.brand).toBe('Tymbark, Maspex');
    expect(f.per100.carbs).toBe(10.5);
    expect(f.unit).toBe('ml');
    expect(f.portions[0]).toEqual({ label: 'porcja (250 ml)', grams: 250 });
    expect(f.portions[1].grams).toBe(1000);
  });
  it('liczy kcal z kJ i obsługuje tagi marek', () => {
    const f = offToFood({ code: '123456', product_name: 'X', brands: ['xx:mlekovita'], nutriments: { 'energy-kj_100g': 418.4 } })!;
    expect(f.per100.kcal).toBe(100);
    expect(f.brand).toBe('Mlekovita');
  });
  it('odrzuca produkty bez wartości', () => {
    expect(offToFood({ code: '1', product_name: 'X', nutriments: {} })).toBeNull();
    expect(offToFood({ code: '1', nutriments: { 'energy-kcal_100g': 1 } })).toBeNull();
  });
  it('czyści składnię Lucene', () => {
    expect(sanitizeQuery('mleko "3,2%" AND (ser)')).toBe('mleko 3,2% and ser');
  });
  it('limiter okna przesuwnego', () => {
    let t = 0;
    const l = new RateLimiter(2, 1000, () => t);
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
    expect(l.waitMs()).toBe(1000);
    t = 1001;
    expect(l.tryTake()).toBe(true);
  });
});

describe('fetch z cache', () => {
  beforeEach(async () => {
    await resetDBForTests();
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('searchOFF wysyła poprawne zapytanie i cache’uje wynik', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.origin + u.pathname).toBe('https://search.openfoodfacts.org/search');
      expect(u.searchParams.get('langs')).toBe('pl,en');
      expect(u.searchParams.get('fields')).toContain('nutriments');
      return new Response(JSON.stringify({ hits: [{ code: '590', product_name: 'Skyr', nutriments: { 'energy-kcal_100g': 63 } }], count: 1 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const a = await searchOFF('skyr', { preferPoland: true });
    expect(a.foods[0].name).toBe('Skyr');
    expect(a.fromCache).toBe(false);
    const b = await searchOFF('Skyr ', { preferPoland: true });
    expect(b.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('q')).toBe('skyr countries:"en:poland"');
  });

  it('productByBarcode: status 0 = brak produktu', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/5901234123457\?fields=/);
      return new Response(JSON.stringify({ status: 0, status_verbose: 'product not found' }));
    }));
    const r = await productByBarcode('5901234123457');
    expect(r.food).toBeNull();
  });

  it('searchUSDA mapuje składniki i odejmuje błonnik od węglowodanów', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      expect(u.pathname).toBe('/fdc/v1/foods/search');
      expect(u.searchParams.get('api_key')).toBe('DEMO_KEY');
      return new Response(
        JSON.stringify({
          foods: [
            {
              fdcId: 171688,
              description: 'APPLES, RAW, WITH SKIN',
              dataType: 'SR Legacy',
              foodNutrients: [
                { nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: 52 },
                { nutrientId: 1003, nutrientNumber: '203', unitName: 'G', value: 0.26 },
                { nutrientId: 1004, nutrientNumber: '204', unitName: 'G', value: 0.17 },
                { nutrientId: 1005, nutrientNumber: '205', unitName: 'G', value: 13.8 },
                { nutrientId: 1079, nutrientNumber: '291', unitName: 'G', value: 2.4 },
              ],
            },
          ],
        }),
      );
    }));
    const r = await searchUSDA('apple', '');
    expect(r.foods[0]).toMatchObject({ id: 'usda:171688', name: 'Apples, raw, with skin', per100: { kcal: 52, carbs: 11.4, fiber: 2.4 } });
  });

  it('usdaToFood używa energii Atwater, gdy brak 208', () => {
    const f = usdaToFood({ fdcId: 1, description: 'X', foodNutrients: [{ nutrientId: 2047, nutrientNumber: '957', unitName: 'KCAL', value: 80 }] });
    expect(f?.per100.kcal).toBe(80);
  });
});
