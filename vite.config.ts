import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Na GitHub Pages aplikacja działa pod /<nazwa-repo>/ – ścieżkę ustawia workflow (BASE_PATH).
const base = process.env.BASE_PATH || '/';
const version = `${process.env.npm_package_version ?? '1.0.0'}${process.env.GITHUB_SHA ? '-' + process.env.GITHUB_SHA.slice(0, 7) : ''}`;

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: base,
        name: 'Kalorie – licznik kalorii',
        short_name: 'Kalorie',
        description: 'Dziennik kalorii i makroskładników z bazą produktów, skanerem kodów i szacowaniem ze zdjęcia.',
        lang: 'pl',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f4',
        theme_color: '#1f8a5b',
        categories: ['health', 'food', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Zapytania do API (Open Food Facts, USDA, Worker AI) nie są cache'owane przez SW –
        // aplikacja ma własny cache w IndexedDB z kontrolą czasu życia.
      },
    }),
  ],
  build: {
    target: ['es2020', 'safari15'],
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'worker/test/**/*.test.ts'],
    environment: 'node',
  },
});
