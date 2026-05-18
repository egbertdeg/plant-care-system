import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { cloudflare } from '@cloudflare/vite-plugin'
import { execSync } from 'child_process'

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
})()
const buildDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const appVersion = `${buildDate} · ${gitHash}`

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Plant Care',
        short_name: 'Plants',
        description: 'Outdoor plant care logging',
        theme_color: '#111111',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        runtimeCaching: [
          { urlPattern: /\/api\/.*/i, handler: 'NetworkOnly', method: 'GET' },
          { urlPattern: /\/api\/.*/i, handler: 'NetworkOnly', method: 'POST' },
          { urlPattern: /\/api\/.*/i, handler: 'NetworkOnly', method: 'PUT' },
          { urlPattern: /\/api\/.*/i, handler: 'NetworkOnly', method: 'DELETE' },
          { urlPattern: /\/api\/.*/i, handler: 'NetworkOnly', method: 'PATCH' },
        ],
      },
    }),
    cloudflare(),
  ],
})
