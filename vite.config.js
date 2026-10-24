import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Shribely',
        short_name: 'Shribely',
        description: 'Live scores, stats and standings for your favorite teams',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f0f13',
        theme_color: '#0f0f13',
        categories: ['sports', 'news'],
        icons: [
          { src: '/icons/icon-72x72.png',   sizes: '72x72',   type: 'image/png' },
          { src: '/icons/icon-96x96.png',   sizes: '96x96',   type: 'image/png' },
          { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Keep the shell and the hashed assets in the same precache. Serving a
        // newer HTML document from the network while this worker still has the
        // previous bundle is what left the Home Screen app blank.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/assets\//],
        runtimeCaching: [
          // ESPN API: network-first, 5 min cache
          { urlPattern: /^https:\/\/site\.api\.espn\.com\/.*/i, handler: 'NetworkFirst', options: { cacheName: 'espn-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 }, networkTimeoutSeconds: 5 } },
          // ESPN images: cache-first, 7 days
          { urlPattern: /^https:\/\/a\.espncdn\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'espn-images', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } } },
          // MLB headshots: cache-first, 24h
          { urlPattern: /^https:\/\/img\.mlbstatic\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'mlb-images', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } } },
          // NHL assets: cache-first, 24h
          { urlPattern: /^https:\/\/assets\.nhle\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'nhl-images', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } } },
        ],
      },
    }),
  ],
  base: '/',
  server: {
    allowedHosts: true,
  },
})
