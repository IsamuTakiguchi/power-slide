import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright が管理する Chromium が無い環境（Playwright のバージョンと違う Chromium だけが
 * 入っているコンテナなど）では、CHROMIUM_PATH で実行ファイルを指定できる。
 */
const chromiumPath = process.env.CHROMIUM_PATH
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {}

/** Web 版の確認用サーバー。vite preview で dist-web/ を配信する。 */
const WEB_URL = 'http://localhost:4173/power-slide/'

export default defineConfig({
  testDir: './tests',
  // Electron の起動と書き出しはそれなりに時間がかかる
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [
    // デスクトップ版（Electron を実際に起動する）
    { name: 'electron', testMatch: /smoke\.spec\.ts/ },
    // Web 版（PC のブラウザ）
    {
      name: 'web-desktop',
      testMatch: /web\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, launchOptions },
    },
    // Web 版（タブレット。リボンは 1 行、スライド一覧は縦のまま）
    // このコンテナには Chromium しか無いので、Chromium 系のタブレット端末を選んでいる
    {
      name: 'web-tablet',
      testMatch: /web\.spec\.ts/,
      use: { ...devices['Galaxy Tab S4'], baseURL: WEB_URL, launchOptions },
    },
    // Web 版（スマホ。タッチ操作・狭い画面）
    {
      name: 'web-mobile',
      testMatch: /web\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: WEB_URL, launchOptions },
    },
  ],
  webServer: {
    command: 'npm run preview:web',
    url: WEB_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
