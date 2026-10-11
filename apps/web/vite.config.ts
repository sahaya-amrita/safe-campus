/// <reference types="vitest/config" />
// TEMPORARY BOOTSTRAP SCAFFOLD — integration-owned. See SCAFFOLD.md.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // TEMPORARY SCAFFOLD: installable PWA + offline app shell. Integration-owned; see SCAFFOLD.md.
    VitePWA({
      // Updates wait for the user ("Reload to update") so a new version never interrupts a help request.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['brand/favicon-64.png', 'brand/apple-touch-icon-180.png'],
      manifest: {
        name: 'Amrita Sahaya (prototype)',
        short_name: 'Amrita Sahaya',
        description:
          'Campus safety preparedness and response coordination. DEMO prototype — not monitored by campus security.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F5F1',
        theme_color: '#A4123F',
        lang: 'en',
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'brand/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell, including every script's woff2 font, so the app opens offline.
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        navigateFallback: '/index.html',
        // API responses are never cached: delivery state must come from the server.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Phase 8: background-sync wake-up and push notices (public/sw-extra.js).
        importScripts: ['sw-extra.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      // Shared contracts consumed from source so dev and tests need no prior package build.
      '@sahaya/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // *.test.mjs files are node:test suites run by `pnpm test:node`, not Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
