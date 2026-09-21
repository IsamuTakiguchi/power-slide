/**
 * build/icon.svg から各サイズの PNG を描画する。
 *
 * - build/icon.png（1024）: electron-builder が各 OS 向けのアイコン（.ico / .icns）を自動生成する元
 * - src/renderer/public/icons/*: Web 版（PWA）のアイコン。ホーム画面・タブ・iPhone 用
 *
 * 描画には Playwright 同梱の Chromium を使う（追加の画像ライブラリを入れないため）。
 * 生成した PNG はリポジトリにコミットしてあるので、アイコンを描き直したときだけ実行すればよい。
 *
 *   node scripts/render-icon.mjs
 *
 * Playwright が管理する Chromium が無い環境では、CHROMIUM_PATH で実行ファイルを指定できる。
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const source = resolve('build/icon.svg')

const TARGETS = [
  { path: 'build/icon.png', size: 1024 },
  { path: 'src/renderer/public/icons/icon-512.png', size: 512 },
  { path: 'src/renderer/public/icons/icon-192.png', size: 192 },
  { path: 'src/renderer/public/icons/apple-touch-icon.png', size: 180 },
]

async function launch() {
  try {
    return await chromium.launch()
  } catch (error) {
    // Playwright のバージョンと違う Chromium しか無い環境（CI のイメージなど）向けの逃げ道
    const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].filter(Boolean)
    const executablePath = candidates.find((path) => existsSync(path))
    if (!executablePath) throw error
    return chromium.launch({ executablePath })
  }
}

const svg = readFileSync(source, 'utf8')
const browser = await launch()
try {
  for (const target of TARGETS) {
    const { size } = target
    const scaled = svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`)
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${scaled}</body></html>`,
    )
    const output = resolve(target.path)
    mkdirSync(dirname(output), { recursive: true })
    await page.screenshot({
      path: output,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    })
    await page.close()
    console.log(`書き出しました: ${target.path} (${size}px)`)
  }
} finally {
  await browser.close()
}
