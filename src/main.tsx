import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { cachePrune } from './db/db';
import { loadSettings } from './settings';
import { applyTheme } from './theme';
import { updateAvailable } from './ui/UpdateBanner';
import './styles.css';

async function start() {
  const root = document.getElementById('app')!;
  try {
    const s = await loadSettings();
    applyTheme(s.theme);
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme(s.theme));
  } catch (e) {
    root.innerHTML = `<div class="page"><div class="notice error" style="margin-top:40px">Nie można otworzyć bazy danych w przeglądarce (${String(
      (e as Error).message ?? e,
    )}). W trybie prywatnym Safari dane mogą być niedostępne.</div></div>`;
    return;
  }
  render(<App />, root);
  void cachePrune(1000 * 60 * 60 * 24 * 14).catch(() => undefined);

  // Poproś o trwałe przechowywanie, żeby przeglądarka nie usuwała danych.
  void navigator.storage?.persist?.().catch(() => undefined);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const updateSW = registerSW({
      onNeedRefresh() {
        updateAvailable.set(() => void updateSW(true));
      },
    });
  }
}

void start();
