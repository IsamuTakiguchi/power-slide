import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Electron の起動と書き出しはそれなりに時間がかかる
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
})
