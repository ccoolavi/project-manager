import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'KaizenPM',
        short_name: 'KaizenPM',
        description: 'Multi-tenant Project & Habit Management',
        theme_color: '#264ef5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/project-manager/',
        // Paths must carry the base, or an installed app resolves them against
        // the domain root and the icons 404.
        icons: [
          {
            src: '/project-manager/icons/192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/project-manager/icons/512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // config.json carries the current API endpoint. Precaching it would pin
        // the app to whatever endpoint was live at build time — exactly the
        // coupling the runtime config exists to remove.
        globIgnores: ['**/config.json'],
        navigateFallbackDenylist: [/config\.json$/],
        runtimeCaching: [
          {
            urlPattern: /config\.json$/,
            handler: 'NetworkOnly'
          },
          {
            // The API is reached through a Cloudflare tunnel, so the previous
            // /^https:\/\/api\./ pattern never matched anything and the offline
            // cache was silently inert.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('trycloudflare.com') ||
              url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  base: '/project-manager/',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The server is a single shared ARM core, but this is a static bundle on
    // GitHub Pages, so the cost that matters is what a phone has to download and
    // parse over a slow connection.
    target: 'es2020',
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 250,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Split by change cadence, not by size: react and the router almost never
        // change, so a routine app update should not invalidate them in cache.
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          vendor: ['axios', 'zod'],
          icons: ['lucide-react'],
          // recharts alone is the single biggest dependency in the app; split
          // out so pages that never chart anything don't pay for it, and so it
          // caches independently of application code that changes far more often.
          charts: ['recharts']
        }
      }
    }
  }
})
