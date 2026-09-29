import { expect, test } from '@playwright/test';
import { blockExternal, openApp } from './helpers';

test('bez zgody na aparat: komunikat i ręczne wpisanie kodu (UPC-A → normalizacja)', async ({ page }) => {
  await blockExternal(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  let requested = '';
  await page.route('https://world.openfoodfacts.org/api/v2/product/**', async (route) => {
    requested = route.request().url();
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 1, product: { code: '0034000470693', product_name: 'Peanut butter cups', nutriments: { 'energy-kcal_100g': 520, proteins_100g: 10, fat_100g: 30, carbohydrates_100g: 52 } } }),
    });
  });
  await openApp(page);
  await page.goto('/#/skaner');
  await expect(page.getByTestId('camera-error')).toContainText('Brak zgody na aparat');
  await page.getByTestId('manual-code').fill('034000470693');
  await page.getByTestId('manual-go').click();
  await expect(page.getByTestId('scan-found')).toContainText('Peanut butter cups');
  expect(requested).toContain('/product/0034000470693?');
});
