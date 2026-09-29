import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('manifest, ikony i meta dla iOS', async ({ page, request }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest.lang).toBe('pl');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toContain('apple-touch-icon.png');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  expect((await request.get('icons/apple-touch-icon.png')).ok()).toBe(true);
});

test('działa offline po pierwszym uruchomieniu', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  // poczekaj, aż SW przejmie kontrolę (precache gotowy)
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('skip-onboarding').click();
  // wbudowana baza działa bez sieci, a wyszukiwarka online informuje o braku internetu
  await page.getByTestId('add-breakfast').click();
  await page.getByTestId('search').fill('banan');
  await expect(page.getByTestId('search-results').getByTestId('food-row').first()).toContainText('Banan');
  await expect(page.getByTestId('off-results')).toContainText('Brak internetu');
  await context.setOffline(false);
});
