/**
 * build/icon.svg を 1024x1024 の PNG に描画する。
 * electron-builder は build/icon.png から各 OS 向けのアイコン（.ico / .icns）を自動生成する。
 *
 * 描画には Playwright 同梱の Chromium を使う（追加の画像ライブラリを入れないため）。
 * 生成した PNG はリポジトリにコミットしてあるので、アイコンを描き直したときだけ実行すればよい。
 *
 *   node scripts/render-icon.mjs
 *
 * Playwright が管理する Chromium が無い環境では、CHROMIUM_PATH で実行ファイルを指定できる。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const SIZE = 1024
const source = resolve('build/icon.svg')
const target = resolve('build/icon.png')

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
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 })
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
  )
  await page.screenshot({
    path: target,
    omitBackground: true,
    clip: { x: 0, y: 0, width: SIZE, height: SIZE },
  })
  console.log(`書き出しました: ${target}`)
} finally {
  await browser.close()
}
