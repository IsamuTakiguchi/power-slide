/**
 * PDF 書き出し。編集画面と同じ DOM を隠しウィンドウに描かせ、
 * Chromium の printToPDF でそのまま出力する（外部ライブラリ不要）。
 */
import { writeFile } from 'node:fs/promises'
import type { Deck } from '@shared/deck'
import { SLIDE_HEIGHT, SLIDE_HEIGHT_IN, SLIDE_WIDTH, SLIDE_WIDTH_IN } from '@shared/geometry'
import { createRenderWindow, renderInWindow } from '../rendererTarget'

export async function exportDeckToPdf(deck: Deck, filePath: string): Promise<void> {
  const window = await createRenderWindow(SLIDE_WIDTH, SLIDE_HEIGHT)
  try {
    await renderInWindow(window, { deck, mode: 'all' })
    const data = await window.webContents.printToPDF({
      // Electron の printToPDF は inch 指定
      pageSize: { width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN },
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true,
    })
    await writeFile(filePath, data)
  } finally {
    window.destroy()
  }
}
