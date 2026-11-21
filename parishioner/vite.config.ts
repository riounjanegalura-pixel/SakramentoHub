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
      workbox: {
        // App-shell caching only — no runtime caching of API calls,
        // no background sync, no queued mutations. See spec's PWA scope note.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // The HEIC converter is a ~3 MB file used only when someone picks an iPhone photo; it is fetched then, not on every install.
        globIgnores: ['**/heic-to*.js'],
      },
      manifest: {
        name: 'SakramentoHub',
        short_name: 'SakramentoHub',
        description: 'Manage sacraments and services at St. Peter the Apostle Parish',
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
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    setupFiles: ['./src/test/setup.ts'],
  },
} satisfies ReturnType<typeof defineVitestConfig>)
