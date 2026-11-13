import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// BASE_PATH: podścieżka na GitHub Pages, np. /kolekcja-night-city/
// HTTPS=1: lokalny serwer z certyfikatem (aparat w telefonie wymaga HTTPS)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    ...(process.env.HTTPS ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Kolekcja Night City',
        short_name: 'Night City',
        description: 'Skaner, inwentarz i wyceny kart Cyberpunk TCG',
        lang: 'pl',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0612',
        theme_color: '#0a0612',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /\/data\/.*\.(json|bin)$/, handler: 'StaleWhileRevalidate', options: { cacheName: 'dane' } },
          {
            urlPattern: /\/img\/.*\.webp$/, handler: 'CacheFirst',
            options: { cacheName: 'obrazki-kart', expiration: { maxEntries: 800 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'server/**/*.test.ts'] },
});
