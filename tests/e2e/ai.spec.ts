import { expect, test } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { blockExternal, openApp } from './helpers';

/** Prosty PNG w jednolitym kolorze (bez zależności). */
function makePng(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([200, 120 + (x % 50), 60], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const ESTIMATE = {
  is_food: true,
  meal_name: 'Kotlet schabowy z ziemniakami i mizerią',
  notes: 'Założono smażenie na oleju rzepakowym.',
  model: 'claude-opus-5-5',
  items: [
    { name: 'Kotlet schabowy panierowany', grams: 150, kcal: 398, protein: 27, fat: 22.5, carbs: 19.5, fiber: 1, confidence: 'high' },
    { name: 'Ziemniaki gotowane', grams: 200, kcal: 172, protein: 3.4, fat: 0.2, carbs: 36.4, fiber: 3.6, confidence: 'medium' },
    { name: 'Mizeria', grams: 100, kcal: 50, protein: 1.2, fat: 3.3, carbs: 3.8, fiber: 0.6, confidence: 'low' },
  ],
};

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test('zdjęcie → kompresja → backend → edycja → dziennik', async ({ page }) => {
  let body: { mode: string; image: string; text?: string; quality?: string } | null = null;
  await page.route('https://ai.test.invalid/estimate', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
    body = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ESTIMATE) });
  });
  await openApp(page);
  await page.getByTestId('add-lunch').click();
  await page.getByTestId('qa-photo').click();
  await expect(page.getByText('To tylko szacunek.')).toBeVisible();
  await page.getByTestId('gallery-input').setInputFiles({ name: 'obiad.png', mimeType: 'image/png', buffer: makePng(2400, 1600) });
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await expect(page.getByText(/1024×683/)).toBeVisible();
  await page.getByTestId('ai-context').fill('smażone na oleju');
  await page.getByTestId('ai-run').click();
  await expect(page.getByTestId('ai-result')).toContainText('Kotlet schabowy z ziemniakami');

  // wysłano JPEG w base64 (bez prefiksu data:), z kontekstem
  expect(body!.mode).toBe('photo');
  expect(body!.quality).toBe('fast');
  expect(body!.text).toBe('smażone na oleju');
  const img = Buffer.from(body!.image, 'base64');
  expect([img[0], img[1], img[2]]).toEqual([0xff, 0xd8, 0xff]);
  expect(img.length).toBeLessThan(400_000);

  await expect(page.getByTestId('ai-total')).toHaveText('620 kcal');
  // mniej ziemniaków: 100 g zamiast 200 g → −86 kcal
  await page.getByTestId('ai-grams').nth(1).fill('100');
  await expect(page.getByTestId('ai-total')).toHaveText('534 kcal');
  // usuń mizerię
  await page.getByRole('button', { name: 'Usuń Mizeria' }).click();
  await expect(page.getByTestId('ai-item')).toHaveCount(2);
  await expect(page.getByTestId('ai-total')).toHaveText('484 kcal');
  // dodaj składnik z bazy: łyżka ketchupu (15 g = 15 kcal)
  await page.getByTestId('ai-add-item').click();
  await page.getByTestId('ingredient-search').fill('ketchup');
  await page.getByTestId('search-results').getByTestId('food-row').first().click();
  await page.getByTestId('ingredient-grams').fill('15');
  await page.getByTestId('ingredient-save').click();
  await expect(page.getByTestId('ai-total')).toHaveText('499 kcal');

  await page.getByTestId('ai-save').click();
  await expect(page.getByTestId('diary')).toBeVisible();
  await expect(page.getByTestId('meal-kcal-lunch')).toHaveText('499 kcal');
  await expect(page.getByTestId('meal-lunch').getByTestId('entry')).toHaveCount(3);
});

test('opis słowami i błąd backendu', async ({ page }) => {
  let calls = 0;
  await page.route('https://ai.test.invalid/estimate', async (route) => {
    calls++;
    if (calls === 1) {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ error: 'Przekroczono limit darmowego pakietu Gemini. Spróbuj ponownie za ok. 37 s.' }),
      });
    }
    const req = route.request().postDataJSON();
    expect(req).toEqual({ mode: 'text', text: 'dwa jajka sadzone na maśle', quality: 'fast' });
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ is_food: true, meal_name: 'Jajka sadzone', notes: '', items: [{ name: 'Jajko sadzone', grams: 100, kcal: 196, protein: 13.6, fat: 14.8, carbs: 0.8, fiber: 0, confidence: 'high' }, { name: 'Masło', grams: 10, kcal: 74, protein: 0.1, fat: 8.2, carbs: 0.1, fiber: 0, confidence: 'medium' }] }),
    });
  });
  await openApp(page);
  await page.goto('/#/ai?m=breakfast&tryb=opis');
  await page.getByTestId('ai-description').fill('dwa jajka sadzone na maśle');
  await page.getByTestId('ai-run').click();
  await expect(page.getByTestId('ai-error')).toContainText('Przekroczono limit darmowego pakietu Gemini');
  await page.getByTestId('ai-run').click();
  await expect(page.getByTestId('ai-total')).toHaveText('270 kcal');
  await page.getByTestId('ai-save').click();
  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('270 kcal');
});

test('brak adresu backendu → wskazówka', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/ustawienia');
  await page.getByTestId('ai-endpoint').fill('');
  await page.getByTestId('ai-endpoint').blur();
  await page.goto('/#/ai');
  await expect(page.getByTestId('ai-no-endpoint')).toBeVisible();
  await expect(page.getByTestId('ai-run')).toBeDisabled();
});

test('opcja „Dokładniej” wysyła quality=accurate', async ({ page }) => {
  let quality = '';
  await page.route('https://ai.test.invalid/estimate', async (route) => {
    quality = route.request().postDataJSON().quality;
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ is_food: true, meal_name: 'Jabłko', notes: '', items: [{ name: 'Jabłko', grams: 180, kcal: 94, protein: 0.5, fat: 0.4, carbs: 20.5, fiber: 4.3, confidence: 'high' }] }),
    });
  });
  await openApp(page);
  await page.goto('/#/ustawienia');
  await page.getByTestId('ai-accurate').check();
  await page.goto('/#/ai?tryb=opis');
  await page.getByTestId('ai-description').fill('jedno jabłko');
  await page.getByTestId('ai-run').click();
  await expect(page.getByTestId('ai-total')).toHaveText('94 kcal');
  expect(quality).toBe('accurate');
});
