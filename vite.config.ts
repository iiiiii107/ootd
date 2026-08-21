import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { PAPER } from './scripts/icon.js';

export default defineConfig({
  base: '/ootd/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // No `includeAssets` here: that option exists to pull in files the build
      // doesn't emit, but everything in `public/` is copied into the output
      // that `globPatterns` below already sweeps. Listing them twice put every
      // icon in the precache manifest twice, with identical revisions.
      //
      // The four icons named in `manifest.icons` are still listed twice — the
      // plugin precaches those itself on top of the glob. Silencing that would
      // mean a `globIgnores` list duplicating the manifest icon names, which
      // then drifts silently the first time an icon is added or renamed. Four
      // repeated entries pointing at an identical revision cost nothing (the
      // Cache API is keyed by URL) and are the better trade.
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
        // The HEIC→JPEG fallback (spec R4) is dynamically imported so its ~3MB
        // libheif WASM decoder doesn't bloat the main bundle — but it still has
        // to be precached, or a HEIC photo picked in airplane mode would fail to
        // convert. Workbox's 2MB default would silently skip that chunk.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Photos live in IndexedDB and are never fetched, so the cache only
        // ever holds the shell — but a stale shell is the one way this app can
        // break, so let a new service worker take over immediately.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        // The background-removal model (spec R3, src/images/cutout.ts) is
        // ~40MB and deliberately not precached day-one — it's fetched from
        // IMG.LY's CDN the first time someone actually uses the feature.
        // This runtime rule caches it after that first fetch (CacheFirst:
        // the model is versioned and immutable, never worth re-fetching)
        // so every use after the first works offline too, matching spec
        // R3's own "download, cached after first use" framing.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://staticimgly.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'bg-removal-model',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // onnxruntime-web (the inference engine @imgly/background-removal runs
          // the model with) bundles its own ~24MB WASM binary as a same-origin,
          // content-hashed asset rather than fetching it from a CDN — self-hosted,
          // but too large for the day-one precache above, same reasoning as the
          // model weights. A hashed filename means a stale cached copy is never a
          // problem: a new build simply requests a new hash.
          {
            urlPattern: ({ sameOrigin, url }) =>
              sameOrigin && (url.pathname.includes('/ort') || url.pathname.endsWith('.wasm')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'bg-removal-runtime',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // So the install prompt and offline behaviour can be checked in dev.
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
