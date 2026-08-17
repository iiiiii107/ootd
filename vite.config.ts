import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { PAPER } from './scripts/icon.js';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon.svg'],
      manifest: {
        name: 'ootd',
        short_name: 'ootd',
        description: 'Outfit of the day. Your wardrobe, on your phone, and nowhere else.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        // Fullscreen with no address bar once installed (spec §3).
        display: 'standalone',
        orientation: 'portrait',
        background_color: PAPER,
        theme_color: PAPER,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-1024.png', sizes: '1024x1024', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole shell so the app opens in airplane mode. Fonts are
        // bundled, so this really is everything the app needs at runtime.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Photos live in IndexedDB and are never fetched, so the cache only
        // ever holds the shell — but a stale shell is the one way this app can
        // break, so let a new service worker take over immediately.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        // So the install prompt and offline behaviour can be checked in dev.
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
