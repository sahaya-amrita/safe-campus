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
        description: 'Student safety check-in and preparedness. Prototype — not monitored by campus security.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F5F1',
        theme_color: '#15273B',
        lang: 'en',
        icons: [
          { src: 'brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app shell, including every script's woff2 font, so the app opens offline.
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        navigateFallback: '/index.html',
        // API responses are never cached: delivery state must come from the server.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      // Shared contracts (Codex 1) consumed from source; root uses pnpm, this app uses npm.
      '@sahaya/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url)),
      zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)),
    },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
