import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// W kontenerze CI/Claude Chromium jest preinstalowany w /opt/pw-browsers.
const executablePath = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    // Service worker blokujemy w testach, żeby mockowanie API (page.route) działało deterministycznie.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { BASE_PATH: '/', VITE_AI_ENDPOINT: 'https://ai.test.invalid' },
  },
});
