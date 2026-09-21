/**
 * Web 版（PWA）のビルド設定。renderer をそのままブラウザ向けにビルドする。
 *
 * デスクトップ版は electron.vite.config.ts（main / preload / renderer の 3 本）を使い、
 * こちらは renderer だけを dist-web/ に出す。Service Worker と manifest は
 * vite-plugin-pwa が生成し、初回表示後はオフラインでも開けるようにする。
 *
 * 公開先のパスは WEB_BASE で変えられる（既定は GitHub Pages のリポジトリ配下）。
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.WEB_BASE ?? '/power-slide/'

export default defineConfig({
  root: 'src/renderer',
  base,
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
    },
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    minify: 'esbuild',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Power Slide',
        short_name: 'Power Slide',
        description: 'PowerPoint 風のスライドを作成・編集・発表・書き出しできるアプリ',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#e6e6e6',
        theme_color: '#c43e1c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // .pslide を「このアプリで開く」に出す（対応ブラウザのみ）
        file_handlers: [{ action: base, accept: { 'application/json': ['.pslide'] } }],
      },
      workbox: {
        // 同梱フォント（woff2 が 1 本 3MB 前後）まで事前キャッシュしてオフラインで動かす
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
})
