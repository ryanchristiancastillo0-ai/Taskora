import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // injectManifest rather than the default generateSW: browser push needs a
    // 'push' listener that only a file we own can provide. src/sw.js carries
    // both the precache behaviour and the push/notification handlers.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['img/logo.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Taskora',
        short_name: 'Taskora',
        description: 'Personal Task Manager',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#16a34a',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      },
      devOptions: {
        enabled: true,
        // The injectManifest worker is built as an ES module, so the dev-side
        // registration must ask for a module worker too.
        type: 'module',
      },
    }),
  ],
  resolve: {
    // `@/` always means `src/`. Feature folders are nested a few levels deep
    // (features/user/<feature>/pages/...), so without this, reaching shared
    // code takes four or five `../` hops.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})