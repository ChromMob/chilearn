import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Lùxiàn Mandarin',
        short_name: 'Lùxiàn',
        description: 'A guided Mandarin course from your first tone to native fluency.',
        start_url: './',
        display: 'standalone',
        background_color: '#f2f4ef',
        theme_color: '#2747a8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}', 'data/core.json', 'data/syllables.json', 'data/charpy.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes('/data/'), handler: 'StaleWhileRevalidate', options: { cacheName: 'course-data', expiration: { maxEntries: 40 } } },
          { urlPattern: ({ url }) => url.pathname.includes('/audio/'), handler: 'CacheFirst', options: { cacheName: 'course-audio', expiration: { maxEntries: 200 } } },
          // speech model runtime (the model itself is cached by the speech worker)
          { urlPattern: ({ url }) => url.pathname.endsWith('.wasm'), handler: 'CacheFirst', options: { cacheName: 'speech-runtime', expiration: { maxEntries: 4 } } },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  worker: { format: 'es' },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
});
