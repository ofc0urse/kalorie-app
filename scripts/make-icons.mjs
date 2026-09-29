// Generuje ikony PNG z public/icons/icon.svg przy użyciu Chromium (Playwright).
// Użycie: npm run icons
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../public/icons/${f}`, import.meta.url).pathname;
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

async function render(size, file, { maskable = false, flat = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // maskable: pełne tło + logo w bezpiecznej strefie (80%); flat: bez zaokrągleń (iOS sam zaokrągla)
  let inner = svg;
  if (maskable || flat) inner = svg.replace('rx="112"', 'rx="0"');
  const scale = maskable ? 0.8 : 1;
  await page.setContent(`<html><body style="margin:0;background:${maskable || flat ? "#1d8457" : "transparent"};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${size * scale}px;height:${size * scale}px">${inner.replace('<svg ', `<svg width="${size * scale}" height="${size * scale}" `)}</div></body></html>`);
  await page.screenshot({ path: out(file), omitBackground: !maskable && !flat });
}

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(512, 'icon-maskable-512.png', { maskable: true });
await render(180, 'apple-touch-icon.png', { flat: true });
await browser.close();
console.log('Ikony wygenerowane.');
