import { expect, test } from '@playwright/test';
import { blockExternal, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await blockExternal(page);
});

test('onboarding liczy cel z Mifflina-St Jeora', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Mężczyzna' }).click();
  await page.getByTestId('age').fill('30');
  await page.getByTestId('height').fill('180');
  await page.getByTestId('weight').fill('80');
  await page.getByTestId('activity').selectOption('moderate');
  await page.getByTestId('goal').selectOption('maintain');
  // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780; TDEE = 1780*1.55 = 2759 -> 2760
  await expect(page.getByTestId('goal-kcal')).toHaveText(/2760/);
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('diary')).toBeVisible();
  await expect(page.getByTestId('kcal-remaining')).toHaveText(/2760/);
});

test('szybkie dodanie, edycja, usunięcie i cofnięcie', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('add-breakfast').click();
  await expect(page.getByTestId('add-view')).toBeVisible();
  await page.getByTestId('qa-quick').click();
  await page.getByTestId('quick-name').fill('Owsianka z kawiarni');
  await page.getByTestId('quick-kcal').fill('450');
  await page.getByTestId('quick-save').click();
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();

  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('450 kcal');
  await expect(page.getByTestId('kcal-remaining')).toHaveText('1550');

  // edycja: 2 porcje
  await page.getByTestId('meal-breakfast').getByTestId('entry').click();
  await page.getByTestId('amount').fill('2');
  await page.getByTestId('sheet-save').click();
  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('900 kcal');

  // przeniesienie do kolacji
  await page.getByTestId('meal-breakfast').getByTestId('entry').click();
  await page.getByTestId('meal-select').selectOption('dinner');
  await page.getByTestId('sheet-save').click();
  await expect(page.getByTestId('meal-kcal-dinner')).toHaveText('900 kcal');
  await expect(page.getByTestId('meal-kcal-breakfast')).toHaveText('0 kcal');

  // usunięcie + cofnij
  await page.getByTestId('meal-dinner').getByTestId('entry').click();
  await page.getByRole('button', { name: 'Usuń z dziennika' }).click();
  await expect(page.getByTestId('meal-kcal-dinner')).toHaveText('0 kcal');
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(page.getByTestId('meal-kcal-dinner')).toHaveText('900 kcal');
});

test('nawigacja po dniach i kopiowanie posiłku z wczoraj', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('prev-day').click();
  await expect(page.getByTestId('day-label')).toContainText('Wczoraj');
  await page.getByTestId('add-lunch').click();
  await page.getByTestId('qa-quick').click();
  await page.getByTestId('quick-kcal').fill('700');
  await page.getByTestId('quick-save').click();
  await page.getByRole('button', { name: 'Gotowe – wróć do dziennika' }).click();
  await expect(page.getByTestId('day-label')).toContainText('Wczoraj');
  await expect(page.getByTestId('meal-kcal-lunch')).toHaveText('700 kcal');

  await page.getByTestId('next-day').click();
  await expect(page.getByTestId('day-label')).toContainText('Dzisiaj');
  await expect(page.getByTestId('meal-kcal-lunch')).toHaveText('0 kcal');
  await page.getByRole('button', { name: 'Opcje: Obiad' }).click();
  await page.getByRole('button', { name: /Kopiuj „Obiad” z wczoraj/ }).click();
  await expect(page.getByTestId('meal-kcal-lunch')).toHaveText('700 kcal');
});

test('woda i waga', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('water-plus').click();
  await page.getByTestId('water-plus').click();
  await expect(page.getByTestId('water-amount')).toContainText('500');
  await page.getByTestId('weight-btn').click();
  await page.getByTestId('weight-input').fill('72,5');
  await page.getByTestId('weight-save').click();
  await expect(page.getByTestId('weight-info')).toContainText('72,5 kg');
  // po przeładowaniu dane zostają (IndexedDB)
  await page.reload();
  await expect(page.getByTestId('water-amount')).toContainText('500');
  await expect(page.getByTestId('weight-info')).toContainText('72,5 kg');
});

test('statystyki pokazują średnią', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('add-snacks').click();
  await page.getByTestId('qa-quick').click();
  await page.getByTestId('quick-kcal').fill('1400');
  await page.getByTestId('quick-save').click();
  await page.goto('/#/statystyki');
  await expect(page.getByTestId('avg-kcal')).toHaveText('1400');
});

test('eksport i import kopii danych', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('add-snacks').click();
  await page.getByTestId('qa-quick').click();
  await page.getByTestId('quick-name').fill('Baton testowy');
  await page.getByTestId('quick-kcal').fill('250');
  await page.getByTestId('quick-save').click();
  await page.goto('/#/ustawienia');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^kalorie-kopia-\d{4}-\d{2}-\d{2}\.json$/);

  // usuń wszystko
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Usuń wszystkie dane' }).click();
  await expect(page.getByTestId('onboarding')).toBeVisible();
  await page.getByTestId('skip-onboarding').click();
  await expect(page.getByTestId('kcal-eaten')).toHaveText('0');

  await page.goto('/#/ustawienia');
  page.once('dialog', (d) => d.accept()); // OK = zastąp
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByText('Zaimportowano dane')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('250');
});
