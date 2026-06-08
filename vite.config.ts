import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages のプロジェクトページでもサブパスに依存しないよう base は相対パス。
// ルーティングは HashRouter を使うため、これで Pages 上でも 404 にならない。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'バイク メンテナンスノート',
        short_name: 'メンテノート',
        description: 'バイクの給油・メンテナンス・保険を管理するメンテナンスノート',
        theme_color: '#1f2933',
        background_color: '#f5f7fa',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'ja',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
})
