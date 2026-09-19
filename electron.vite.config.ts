import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = {
  '@shared': resolve('src/shared'),
}

/**
 * 本番ビルドの index.html にだけ CSP を入れる。
 * 開発中は Vite の HMR が inline script を使うため、meta CSP は付けない。
 */
function productionCsp(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join('; ')

  return {
    name: 'power-slide-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  </head>`,
      )
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react(), productionCsp()],
    resolve: {
      alias: { ...alias, '@': resolve('src/renderer/src') },
    },
    build: {
      // electron-vite は既定で minify しないので明示的に有効にする
      minify: 'esbuild',
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
  },
})
