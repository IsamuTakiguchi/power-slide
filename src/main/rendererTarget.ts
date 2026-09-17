/**
 * renderer の読み込み先を決める共通処理と、書き出し用の隠しウィンドウ生成。
 *
 * PDF / PNG の書き出しは「編集画面と同じ React コンポーネントで描いたものを
 * Chromium にそのまま出力させる」方針なので、書き出し専用ルート `#/render` を
 * 表示しない BrowserWindow に読み込ませて使う。
 */
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { RenderRequest } from '@shared/ipc'

const RENDER_TIMEOUT_MS = 20_000

export function loadRendererRoute(window: BrowserWindow, hash: string): Promise<void> {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    return window.loadURL(`${devServerUrl}#${hash}`)
  }
  return window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

/**
 * 書き出し専用ウィンドウを作り、指定サイズで `#/render` を読み込む。
 * 呼び出し側は必ず destroy() すること。
 */
export async function createRenderWindow(width: number, height: number): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      offscreen: true,
    },
  })
  await loadRendererRoute(window, '/render')
  return window
}

/**
 * 隠しウィンドウにデッキを渡し、描画（フォント読み込みと画像デコードを含む）が
 * 終わるまで待つ。renderer 側は `window.__psRenderSlide()` を公開している。
 */
export async function renderInWindow(window: BrowserWindow, request: RenderRequest): Promise<void> {
  const payload = JSON.stringify(request)
  await window.webContents.executeJavaScript(
    `window.__psRenderSlide ? window.__psRenderSlide(${payload}) : Promise.reject(new Error('書き出し用の描画関数が見つかりません'))`,
    true,
  )
  await withTimeout(
    window.webContents.executeJavaScript('window.__psWhenRendered()', true),
    RENDER_TIMEOUT_MS,
  )
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('スライドの描画が時間内に終わりませんでした。')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
