import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
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
      globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    },
  }), cloudflare()],
})