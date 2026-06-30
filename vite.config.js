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
        // Cache the app shell and key assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            // Cache ESPN API calls for 5 minutes
            urlPattern: /^https:\/\/site\.api\.espn\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'espn-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Cache ESPN image assets for 7 days
            urlPattern: /^https:\/\/a\.espncdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'espn-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
            },
          },
          {
            // Cache MLB headshots for 24 hours
            urlPattern: /^https:\/\/img\.mlbstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mlb-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            // Cache NHL assets for 24 hours
            urlPattern: /^https:\/\/assets\.nhle\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nhl-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  server: {
    allowedHosts: true,
  },
})
