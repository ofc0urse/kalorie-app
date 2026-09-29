import { expect, test, type Page } from '@playwright/test';
import { blockExternal, openApp } from './helpers';

async function mockOff(page: Page, hits: unknown[]) {
  const calls: URL[] = [];
  await page.route('https://search.openfoodfacts.org/search**', async (route) => {
    calls.push(new URL(route.request().url()));
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits, count: hits.length, page: 1, page_size: 24, page_count: 1 }) });
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test('wyszukiwanie bez polskich znaków w bazie wbudowanej i dodanie porcji', async ({ page }) => {
  await mockOff(page, []);
  await openApp(page);
  await page.getByTestId('add-breakfast').click();
  await page.getByTestId('search').fill('jablko');
  const first = page.getByTestId('search-results').getByTestId('food-row').first();
  await expect(first).toContainText('Jabłko');
  await first.click();
  // domyślnie pierwsza porcja: 1 sztuka (180 g) = 94 kcal
  await expect(page.getByTestId('sheet-nutrients')).toContainText('94');
  await page.getByTestId('amount').fill('2');
  await expect(page.getByTestId('sheet-nutrients')).toContainText('187');
  await page.getByTestId('sheet-save').click();
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();
  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('187 kcal');
  await expect(page.getByTestId('meal-breakfast').getByTestId('entry')).toContainText('2 × sztuka · 360 g');

  // ostatnia ilość jest podpowiadana, ale nie nadpisuje tego, co użytkownik już wpisał
  await page.getByTestId('add-snacks').click();
  await page.getByTestId('search').fill('jablko');
  await page.getByTestId('search-results').getByTestId('food-row').first().click();
  await page.getByTestId('amount').fill('3');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('amount')).toHaveValue('3');
  await page.getByTestId('sheet-save').click();
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();
  await expect(page.getByTestId('meal-snacks').getByTestId('entry')).toContainText('3 × sztuka · 540 g');
});

test('Open Food Facts: debounce, parametry zapytania i zapis produktu', async ({ page }) => {
  const calls = await mockOff(page, [
    {
      code: '5900820000011',
      product_name_pl: 'Skyr pitny naturalny',
      brands: 'Piątnica',
      nutriments: { 'energy-kcal_100g': 60, proteins_100g: 8.5, fat_100g: 0.4, carbohydrates_100g: 5.3, fiber_100g: 0 },
      serving_quantity: 330,
      serving_size: '330 g',
    },
  ]);
  await openApp(page);
  await page.getByTestId('add-lunch').click();
  await page.getByTestId('search').pressSequentially('skyr pitny', { delay: 30 });
  const off = page.getByTestId('off-results');
  await expect(off.getByTestId('food-row')).toContainText('Skyr pitny naturalny');
  // pisanie litera po literze = jedno zapytanie (debounce)
  expect(calls.length).toBe(1);
  expect(calls[0].searchParams.get('langs')).toBe('pl,en');
  expect(calls[0].searchParams.get('q')).toContain('skyr pitny');
  await off.getByTestId('food-row').click();
  await expect(page.getByRole('dialog')).toContainText('Piątnica');
  await page.getByTestId('sheet-save').click();
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();
  await expect(page.getByTestId('meal-kcal-lunch')).toHaveText('198 kcal');

  // produkt jest teraz zapisany lokalnie – znajdziemy go bez internetu
  await page.unroute('https://search.openfoodfacts.org/search**');
  await page.getByTestId('add-lunch').click();
  await page.getByTestId('search').fill('skyr pit');
  await expect(page.getByTestId('search-results').getByTestId('food-row').first()).toContainText('Skyr pitny naturalny');
});

test('USDA na żądanie', async ({ page }) => {
  await mockOff(page, []);
  let usdaUrl: URL | null = null;
  await page.route('https://api.nal.usda.gov/fdc/v1/foods/search**', async (route) => {
    usdaUrl = new URL(route.request().url());
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        foods: [
          {
            fdcId: 169926,
            description: 'AVOCADOS, RAW, CALIFORNIA',
            dataType: 'SR Legacy',
            foodNutrients: [
              { nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: 167 },
              { nutrientId: 1003, nutrientNumber: '203', unitName: 'G', value: 1.96 },
              { nutrientId: 1004, nutrientNumber: '204', unitName: 'G', value: 15.4 },
              { nutrientId: 1005, nutrientNumber: '205', unitName: 'G', value: 8.64 },
              { nutrientId: 1079, nutrientNumber: '291', unitName: 'G', value: 6.8 },
            ],
          },
        ],
      }),
    });
  });
  await openApp(page);
  await page.getByTestId('fab').click();
  await page.getByTestId('search').fill('avocado');
  await page.getByTestId('usda-search').click();
  await expect(page.getByTestId('usda-results').getByTestId('food-row')).toContainText('Avocados, raw, california');
  expect(usdaUrl!.searchParams.get('dataType')).toBe('Foundation,SR Legacy');
  expect(usdaUrl!.searchParams.get('query')).toBe('avocado');
});

test('własny produkt, ulubione i przepis', async ({ page }) => {
  await mockOff(page, []);
  await openApp(page);
  await page.goto('/#/produkty');
  await page.getByTestId('new-food').click();
  await page.getByTestId('fe-name').fill('Chleb od sąsiadki');
  await page.getByTestId('fe-kcal').fill('240');
  await page.getByTestId('fe-protein').fill('8');
  await page.getByTestId('fe-fat').fill('2');
  await page.getByTestId('fe-carbs').fill('46');
  await page.getByTestId('fe-fiber').fill('5');
  await page.getByRole('button', { name: 'Dodaj porcję' }).click();
  await page.getByLabel('Nazwa porcji').fill('kromka');
  await page.getByTestId('food-editor').locator('.input-suffix input').last().fill('40');
  await page.getByTestId('fe-save').click();
  await expect(page.getByTestId('products')).toContainText('Chleb od sąsiadki');

  // przepis z dwóch składników
  await page.getByRole('button', { name: 'Przepisy' }).click();
  await page.getByTestId('new-recipe').click();
  await page.getByTestId('re-name').fill('Kanapki z masłem');
  for (const [q, g] of [
    ['sąsiadki', '80'],
    ['maslo', '10'],
  ]) {
    await page.getByTestId('re-add-ingredient').click();
    await page.getByTestId('ingredient-search').fill(q);
    await page.getByTestId('search-results').getByTestId('food-row').first().click();
    await page.getByTestId('ingredient-grams').fill(g);
    await page.getByTestId('ingredient-save').click();
  }
  await page.getByTestId('re-servings').fill('2');
  // 80 g chleba = 192 kcal, 10 g masła = 74 kcal → 266 / 2 = 133 kcal na porcję
  await expect(page.getByTestId('re-summary')).toContainText('133 kcal');
  await page.getByTestId('re-save').click();
  await expect(page.getByTestId('recipe-row')).toContainText('Kanapki z masłem');

  // przepis w wyszukiwarce + ulubione
  await page.goto('/#/');
  await page.getByTestId('add-dinner').click();
  await page.getByTestId('search').fill('kanapki');
  await page.getByTestId('search-results').getByTestId('food-row').first().click();
  await page.getByRole('button', { name: 'Do ulubionych' }).click();
  await page.getByTestId('sheet-save').click();
  await page.getByTestId('search').fill('');
  await page.getByRole('button', { name: 'Ulubione' }).click();
  await expect(page.getByTestId('add-view').getByTestId('food-row')).toContainText('Kanapki z masłem');
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();
  await expect(page.getByTestId('meal-kcal-dinner')).toHaveText('133 kcal');
});
