import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { defineConfig } from 'vite'
import { defineConfig as defineVitestConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // App shell only: the built files are cached so repeat visits open at once.
      // API calls are never cached by the service worker (data is remembered by the query cache and wiped on sign-out).
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'], navigateFallbackDenylist: [/^\/api/] },
      manifest: {
        name: 'SakramentoHub Admin',
        short_name: 'Parish Admin',
        description: 'Parish office tools for SakramentoHub',
        theme_color: '#1B2A4A',
        background_color: '#FAF8F4',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
  },
} satisfies ReturnType<typeof defineVitestConfig>)
