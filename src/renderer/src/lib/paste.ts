/**
 * スライドへの貼り付けとコピー（Ctrl+C / Ctrl+X / Ctrl+V、Electron の「編集」メニュー、
 * リボンの「クリップボード」）。
 *
 * 貼り付ける中身で振り分ける（PowerPoint と同じ）:
 * ・このアプリでコピーした要素 → そのまま要素として貼る
 * ・Excel などの表（タブ区切り・HTML の表）→ 表の中にいればセルへ、そうでなければ新しい表に
 * ・画像 → 画像として置く
 * ・ただの文字 → テキストボックスにする
 */
import { createTextElement, runsToPlainText, type SlideElement } from '@shared/deck'
import { centerPosition } from '@shared/layouts'
import { fullRange, parseTsv, rangeToHtml, rangeToTsv } from '@shared/table'
import { useDeckStore } from '../store/deckStore'
import { flashStatus } from '../store/uiStore'
import { placeImage } from './commands'
import { gridFromClipboard } from './clipboard'
import { clearTableCells, insertTableFromGrid, pasteGridIntoTable, tableSelectionToClipboard } from './tableCommands'

export interface ClipboardContent {
  text: string
  html: string
  image?: Blob | null
}

/**
 * 最後にこのアプリから OS のクリップボードへ書いた文字。貼り付けのとき、これと同じなら
 * 「このアプリでコピーした要素」とみなして要素ごと貼る（違えば外でコピーし直したもの）。
 */
let lastCopiedText: string | null = null

/** 要素を、ほかのアプリに貼れる文字にする（表はタブ区切りで、Excel にそのまま貼れる）。 */
function elementsToText(elements: SlideElement[]): string {
  const parts = elements.map((element) => {
    switch (element.type) {
      case 'text':
        return runsToPlainText(element.runs)
      case 'shape':
        return element.text ? runsToPlainText(element.text.runs) : ''
      case 'table':
        return rangeToTsv(element, fullRange(element)).replace(/\r\n$/, '')
      default:
        return ''
    }
  })
  return parts.filter(Boolean).join('\n') || '[Power Slide の図]'
}

/**
 * 選んでいる要素（表の中ならセルの範囲）をコピーし、OS のクリップボードに書く中身を返す。
 * cut なら切り取る。コピーするものが無ければ null。
 */
export function copySelection(cut: boolean): { text: string; html?: string } | null {
  const store = useDeckStore.getState()
  if (store.tableCursor) {
    const data = tableSelectionToClipboard()
    if (data && cut) clearTableCells()
    return data
  }
  const elements = store.selectedElements()
  if (elements.length === 0) return null
  store.copySelected()
  const text = elementsToText(elements)
  lastCopiedText = text
  // 表を 1 つだけ選んでいるときは、Excel に貼ったとき書式付きで入るよう HTML も渡す
  const html =
    elements.length === 1 && elements[0].type === 'table'
      ? rangeToHtml(elements[0], fullRange(elements[0]))
      : undefined
  if (cut) store.deleteSelected()
  return { text, html }
}

/** 画像ファイル（Blob）を読み込み、元の大きさを測ってから置く。 */
function insertImageBlob(image: Blob): void {
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result)
    const probe = new Image()
    probe.onload = () => {
      placeImage(dataUrl, image.type || 'image/png', probe.naturalWidth, probe.naturalHeight)
      flashStatus('画像を貼り付けました')
    }
    probe.onerror = () => flashStatus('この画像は貼り付けられませんでした')
    probe.src = dataUrl
  }
  reader.readAsDataURL(image)
}

/** 文字をテキストボックスとして置く。 */
function insertTextFromClipboard(text: string): void {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const lineCount = lines.split('\n').length
  const w = 900
  const h = Math.min(600, Math.max(60, lineCount * 46))
  const store = useDeckStore.getState()
  store.addElement(
    createTextElement({
      ...centerPosition(w, h),
      w,
      h,
      role: 'body',
      fontSize: 32,
      runs: [{ text: lines }],
    }),
  )
  flashStatus('文字をテキストボックスとして貼り付けました')
}

/** 中身を見て、スライド（または表の中）に貼り付ける。何か貼れたら true。 */
export function pasteContent(content: ClipboardContent): boolean {
  const store = useDeckStore.getState()
  const { text, html, image } = content

  // 表の中にいるときは、セルへの貼り付け（タブの無い文字は行ごとに縦へ）
  if (store.tableCursor) {
    const grid = gridFromClipboard(text, html) ?? (text ? parseTsv(text) : null)
    return grid ? pasteGridIntoTable(grid) : false
  }

  if (store.clipboard.length > 0 && text && text === lastCopiedText) {
    store.pasteClipboard()
    return true
  }
  const grid = gridFromClipboard(text, html)
  if (grid) {
    insertTableFromGrid(grid)
    return true
  }
  if (image) {
    insertImageBlob(image)
    return true
  }
  if (text.trim()) {
    insertTextFromClipboard(text)
    return true
  }
  if (store.clipboard.length > 0) {
    store.pasteClipboard()
    return true
  }
  return false
}

// ---------------------------------------------------------------- リボンのボタンから（OS のクリップボードを直接読む）

/** 「貼り付け」ボタン。スマホ・タブレットのように Ctrl+V が無いときのため。 */
export async function pasteFromSystemClipboard(): Promise<void> {
  const content: ClipboardContent = { text: '', html: '', image: null }
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (imageType && !content.image) content.image = await item.getType(imageType)
        if (item.types.includes('text/html') && !content.html) {
          content.html = await (await item.getType('text/html')).text()
        }
        if (item.types.includes('text/plain') && !content.text) {
          content.text = await (await item.getType('text/plain')).text()
        }
      }
    } else if (navigator.clipboard?.readText) {
      content.text = await navigator.clipboard.readText()
    } else {
      throw new Error('clipboard unavailable')
    }
  } catch {
    // ブラウザが読ませてくれないとき（許可していない・未対応）は、ほかの方法を案内する
    if (useDeckStore.getState().clipboard.length > 0 && pasteContent({ text: '', html: '' })) return
    flashStatus('クリップボードを読めませんでした。Ctrl+V（スマホは長押し→「ペースト」）で貼り付けてください', 5000)
    return
  }
  if (!pasteContent(content)) flashStatus('貼り付けられるものがありません')
}

/** 「コピー」「切り取り」ボタン。 */
export async function copyToSystemClipboard(cut: boolean): Promise<void> {
  const data = copySelection(cut)
  if (!data) {
    flashStatus('コピーするものを選んでください')
    return
  }
  try {
    if (data.html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([data.text], { type: 'text/plain' }),
          'text/html': new Blob([data.html], { type: 'text/html' }),
        }),
      ])
    } else {
      await navigator.clipboard.writeText(data.text)
    }
  } catch {
    // OS のクリップボードに書けなくても、アプリの中での貼り付けはできる
  }
  flashStatus(cut ? '切り取りました' : 'コピーしました')
}
