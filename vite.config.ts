import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Xpenden Addiction',
        short_name: 'Xpenden',
        description: 'Daily spending allowance, payday to payday',
        theme_color: '#2F4BD0',
        background_color: '#F4F6FA',
        display: 'standalone',
        start_url: '/',
        shortcuts: [
          { name: 'Add expense', short_name: 'Add expense', description: 'Open Xpenden Addiction to log an expense', url: '/?add-expense=1', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
