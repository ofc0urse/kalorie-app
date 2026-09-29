import { expect, type Page } from '@playwright/test';

/** Otwiera aplikację z pominiętym onboardingiem i celem 2000 kcal. */
export async function openApp(page: Page, path = '/') {
  await page.addInitScript(() => {
    // blokada prawdziwej sieci do zewnętrznych API – testy muszą je mockować
    (window as unknown as { __TEST__: boolean }).__TEST__ = true;
  });
  await page.goto('/');
  await page.getByTestId('skip-onboarding').click();
  await expect(page.getByTestId('diary')).toBeVisible();
  if (path !== '/') await page.goto(`/#${path}`);
}

/** Blokuje wszystkie zapytania poza localhost – żadnego prawdziwego ruchu w testach. */
export async function blockExternal(page: Page) {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
}
