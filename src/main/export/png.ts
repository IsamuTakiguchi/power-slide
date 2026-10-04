/**
 * PNG 書き出し。隠しウィンドウにスライドを 1 枚ずつ描かせ、capturePage で切り出す。
 * フォント描画が Chromium 本体そのままなので、編集画面の見た目と一致する。
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Deck, Sheet } from '@shared/deck'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'
import { createRenderWindow, renderInWindow } from '../rendererTarget'

/**
 * 書き出し解像度（16:9）。
 *
 * capturePage はウィンドウの実ピクセルを撮るため、出力サイズはディスプレイの大きさに
 * 制限される（画面より大きいウィンドウは OS 側で縮められる）。論理座標と同じ 1280x720
 * ならほぼすべての環境で収まるので、これを既定値にしている。
 */
const OUTPUT_WIDTH = SLIDE_WIDTH
const OUTPUT_HEIGHT = SLIDE_HEIGHT

function safeName(name: string, fallback: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || fallback
}

/**
 * 出力ファイル名。シートが 1 枚なら「タイトル-01.png」、複数なら
 * 「タイトル-シート名-01.png」とし、番号はシートごとに振り直す。
 */
function slideFileName(deckTitle: string, sheet: Sheet | null, index: number, total: number): string {
  const digits = String(total).length
  const number = String(index + 1).padStart(digits, '0')
  const title = safeName(deckTitle, 'slide')
  return sheet ? `${title}-${safeName(sheet.name, 'sheet')}-${number}.png` : `${title}-${number}.png`
}

/** 各スライドを PNG として directory に書き出し、書き出したパスを返す。 */
export async function exportDeckToPng(deck: Deck, directory: string): Promise<string[]> {
  const window = await createRenderWindow(OUTPUT_WIDTH, OUTPUT_HEIGHT)
  const written: string[] = []
  try {
    // 描画側は全シートのスライドを連結した通し番号で 1 枚を選ぶ
    const pages = deck.sheets.flatMap((sheet) =>
      sheet.slides.map((_, indexInSheet) => ({ sheet, indexInSheet })),
    )
    const multiSheet = deck.sheets.length > 1
    for (let index = 0; index < pages.length; index += 1) {
      const { sheet, indexInSheet } = pages[index]
      await renderInWindow(window, { deck, mode: 'single', slideIndex: index })
      const captured = await window.webContents.capturePage()
      if (captured.isEmpty()) {
        throw new Error(`${index + 1} 枚目のスライドを画像化できませんでした。`)
      }
      // 画面が狭くてウィンドウが縮められた場合でも、出力サイズは揃えておく
      const size = captured.getSize()
      const image =
        size.width === OUTPUT_WIDTH && size.height === OUTPUT_HEIGHT
          ? captured
          : captured.resize({ width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, quality: 'best' })
      const filePath = join(
        directory,
        slideFileName(deck.title, multiSheet ? sheet : null, indexInSheet, sheet.slides.length),
      )
      await writeFile(filePath, image.toPNG())
      written.push(filePath)
    }
  } finally {
    window.destroy()
  }
  return written
}
