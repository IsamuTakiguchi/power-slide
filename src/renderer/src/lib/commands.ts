/**
 * ファイル操作・書き出し・挿入などのコマンド。
 * メニュー（main プロセス）とツールバーの両方から同じ関数を呼ぶ。
 */
import { platform } from '../platform'
import {
  createImageElement,
  createShapeElement,
  createTextElement,
  type ShapeKind,
} from '@shared/deck'
import { createStarterDeck, centerPosition } from '@shared/layouts'
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import { flashStatus, useUiStore } from '../store/uiStore'

function store() {
  return useDeckStore.getState()
}

async function showError(message: string): Promise<void> {
  await platform.dialog.message({ type: 'error', message })
}

/** 未保存の変更があるとき、破棄してよいか確認する。 */
async function confirmDiscardIfDirty(): Promise<boolean> {
  const { dirty } = store()
  if (!dirty) return true
  return platform.deck.confirmDiscard(
    '保存されていない変更があります。破棄して続けますか？',
  )
}

export async function newDeck(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  store().loadDeck(createStarterDeck(), null)
  flashStatus('新しいプレゼンテーションを作成しました')
}

export async function openDeck(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  const result = await platform.deck.open()
  if (result.canceled) return
  if (result.error) {
    await showError(result.error)
    return
  }
  if (!result.deck || !result.filePath) return
  store().loadDeck(result.deck, result.filePath)
  if (result.schemaWarning) {
    await platform.dialog.message({ type: 'warning', message: result.schemaWarning })
  }
  flashStatus('読み込みました')
}

export async function openDeckPath(filePath: string): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return
  const result = await platform.deck.openPath(filePath)
  if (result.error) {
    await showError(result.error)
    return
  }
  if (!result.deck || !result.filePath) return
  store().loadDeck(result.deck, result.filePath)
  if (result.schemaWarning) {
    await platform.dialog.message({ type: 'warning', message: result.schemaWarning })
  }
  flashStatus('読み込みました')
}

export async function saveDeck(): Promise<boolean> {
  const { deck, filePath, markSaved } = store()
  const result = await platform.deck.save(deck, filePath)
  if (result.canceled) return false
  if (result.error) {
    await showError(result.error)
    return false
  }
  if (result.filePath) {
    markSaved(result.filePath)
    flashStatus('保存しました')
    return true
  }
  return false
}

export async function saveDeckAs(): Promise<boolean> {
  const { deck, markSaved } = store()
  const result = await platform.deck.saveAs(deck)
  if (result.canceled) return false
  if (result.error) {
    await showError(result.error)
    return false
  }
  if (result.filePath) {
    markSaved(result.filePath)
    flashStatus('別名で保存しました')
    return true
  }
  return false
}

type ExportKind = 'pptx' | 'pdf' | 'png'

const EXPORT_LABEL: Record<ExportKind, string> = {
  pptx: 'PowerPoint 形式',
  pdf: 'PDF',
  png: 'PNG 画像',
}

export async function exportDeck(kind: ExportKind): Promise<void> {
  const { deck } = store()
  flashStatus(`${EXPORT_LABEL[kind]}を書き出しています…`, 60_000)
  const result = await platform.exportDeck[kind](deck)
  if (result.canceled) {
    useUiStore.getState().setStatus(null)
    return
  }
  if (result.error) {
    useUiStore.getState().setStatus(null)
    await showError(result.error)
    return
  }
  const count = result.files?.length ?? 0
  flashStatus(
    kind === 'png'
      ? `${EXPORT_LABEL[kind]}を ${count} 枚書き出しました`
      : `${EXPORT_LABEL[kind]}を書き出しました`,
  )
}

// ---------------------------------------------------------------- 挿入

export function insertTextBox(): void {
  const { addElement } = store()
  const position = centerPosition(600, 120)
  addElement(
    createTextElement({
      ...position,
      w: 600,
      h: 120,
      role: 'body',
      fontSize: 32,
      runs: [{ text: 'テキストを入力' }],
    }),
  )
  flashStatus('テキストボックスを追加しました（ダブルクリックで編集）')
}

export function insertShape(shape: ShapeKind): void {
  const state = store()
  const theme = resolveTheme(state.deck.themeId, state.deck.theme)
  const isLine = shape === 'line' || shape === 'arrow'
  const size = isLine ? { w: 360, h: 24 } : { w: 320, h: 200 }
  const position = centerPosition(size.w, size.h)
  state.addElement(
    createShapeElement({
      shape,
      ...position,
      ...size,
      fill: isLine ? undefined : theme.accent,
      stroke: isLine ? theme.accent : undefined,
      strokeWidth: isLine ? 4 : 0,
    }),
  )
}

export async function insertImage(): Promise<void> {
  const picked = await platform.image.pick()
  if (picked.canceled) return
  if (picked.error || !picked.dataUrl || !picked.mime) {
    if (picked.error) await showError(picked.error)
    return
  }
  // 元画像の縦横比を保ったまま、スライドに収まる大きさで置く
  const maxW = 760
  const maxH = 480
  const ratio = picked.width && picked.height ? picked.width / picked.height : 4 / 3
  let w = maxW
  let h = Math.round(maxW / ratio)
  if (h > maxH) {
    h = maxH
    w = Math.round(maxH * ratio)
  }
  const position = centerPosition(w, h)
  store().addElement(
    createImageElement({
      dataUrl: picked.dataUrl,
      mime: picked.mime,
      ...position,
      w,
      h,
      naturalRatio: ratio,
    }),
  )
  flashStatus('画像を追加しました')
}

// ---------------------------------------------------------------- 発表

/** スライドショーを始める。fromStart なら 1 枚目から、それ以外は選択中のスライドから。 */
export async function startPresenting(options: { fromStart?: boolean } = {}): Promise<void> {
  if (options.fromStart) store().selectSlide(0)
  useUiStore.getState().setPresenting(true)
  await platform.presenter.enter()
}

export async function stopPresenting(): Promise<void> {
  useUiStore.getState().setPresenting(false)
  await platform.presenter.exit()
}
