import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { blockExternal, openApp } from './helpers';

// Sztuczna kamera Chromium pokazująca kod EAN-13 5901234123457 – testuje prawdziwe dekodowanie ZXing
const dir = join(process.cwd(), 'test-results');
const video = join(dir, 'barcode-5901234123457.y4m');
if (!existsSync(video)) {
  mkdirSync(dir, { recursive: true });
  execFileSync('node', ['tests/fixtures/make-barcode-video.mjs', '5901234123457', video]);
}
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

test.use({
  permissions: ['camera'],
  launchOptions: {
    executablePath,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  },
});

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test('skan aparatem → produkt z Open Food Facts → dziennik', async ({ page }) => {
  let requested = '';
  await page.route('https://world.openfoodfacts.org/api/v2/product/**', async (route) => {
    requested = route.request().url();
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        code: '5901234123457',
        status: 1,
        status_verbose: 'product found',
        product: {
          code: '5901234123457',
          product_name: 'Baton proteinowy',
          brands: 'Testowa marka',
          nutriments: { 'energy-kcal_100g': 380, proteins_100g: 30, fat_100g: 12, carbohydrates_100g: 35, fiber_100g: 5 },
          serving_quantity: 50,
          serving_size: '50 g',
        },
      }),
    });
  });
  await openApp(page);
  await page.getByTestId('add-snacks').click();
  await page.getByTestId('qa-scan').click();
  await expect(page.getByTestId('scan-found')).toContainText('Baton proteinowy', { timeout: 15_000 });
  expect(requested).toContain('/api/v2/product/5901234123457?fields=');
  await page.getByRole('dialog').getByTestId('sheet-save').click();
  await expect(page.getByTestId('diary')).toBeVisible();
  await expect(page.getByTestId('meal-kcal-snacks')).toHaveText('190 kcal');
});

test('nieznany kod → własny produkt powiązany z kodem → kolejny skan go rozpoznaje', async ({ page }) => {
  let offCalls = 0;
  await page.route('https://world.openfoodfacts.org/api/v2/product/**', async (route) => {
    offCalls++;
    await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 0, status_verbose: 'product not found' }) });
  });
  await openApp(page);
  await page.goto('/#/skaner?m=breakfast');
  await expect(page.getByTestId('scan-notfound')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('scan-add-custom').click();
  await expect(page.getByTestId('fe-barcode')).toHaveValue('5901234123457');
  await page.getByTestId('fe-name').fill('Kefir z lokalnej mleczarni');
  await page.getByTestId('fe-kcal').fill('50');
  await page.getByTestId('fe-save').click();
  await page.getByRole('dialog').getByTestId('amount').fill('400');
  await page.getByRole('dialog').getByTestId('sheet-save').click();
  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('200 kcal');

  // drugi skan – produkt z lokalnej bazy, bez pytania OFF
  await page.goto('/#/skaner?m=breakfast');
  await expect(page.getByTestId('scan-found')).toContainText('Kefir z lokalnej mleczarni', { timeout: 15_000 });
  await expect(page.getByTestId('scan-found')).toContainText('Twoich produktach');
  expect(offCalls).toBe(1);
});
