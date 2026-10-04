/**
 * ファイル操作・書き出し・挿入などのコマンド。
 * メニュー（main プロセス）とツールバーの両方から同じ関数を呼ぶ。
 */
import { platform } from '../platform'
import {
  activeSheetOf,
  createImageElement,
  createShapeElement,
  createTextElement,
  type Deck,
  type ShapeKind,
} from '@shared/deck'
import { createStarterDeck, centerPosition } from '@shared/layouts'
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import { flashStatus, useUiStore, type ExportScope } from '../store/uiStore'

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

// ---------------------------------------------------------------- 自動保存

/**
 * 自動保存の書き先。ファイルに上書きできるならファイル、Web 版でそれができない
 * （保存先が無い・iPhone の Safari など）ならブラウザ内、デスクトップ版で保存先が無ければ null。
 */
export type AutoSaveTarget = 'file' | 'browser' | null

export function autoSaveTarget(filePath: string | null): AutoSaveTarget {
  const { capabilities } = platform
  if (filePath && (capabilities.nativeFiles || capabilities.fileAutosave)) return 'file'
  return capabilities.draftAutosave ? 'browser' : null
}

/**
 * タイトルバーの「自動保存」スイッチ。Office と同じく、保存先が決まっていないまま
 * オンにしようとしたら先に保存先を選んでもらい、取り消したらオフのままにする。
 */
export async function toggleAutoSave(): Promise<void> {
  const ui = useUiStore.getState()
  const { filePath } = store()
  const isOn = ui.autoSaveEnabled && autoSaveTarget(filePath) !== null

  if (isOn) {
    ui.setAutoSaveEnabled(false)
    // オフにしたら、ブラウザ内の下書きも残さない（次に開いたとき古い内容が戻ってこないように）
    await platform.deck.clearDraft?.()
    flashStatus('自動保存をオフにしました。保存は「保存」（Ctrl+S）で行ってください', 4000)
    return
  }

  // 保存先を選べる環境で、まだ決まっていなければ先に選んでもらう
  const canPickFile = platform.capabilities.nativeFiles || platform.capabilities.fileAutosave
  if (!filePath && canPickFile) {
    const saved = await saveDeckAs()
    if (!saved) {
      flashStatus('保存先が決まらなかったため、自動保存はオフのままです', 4000)
      return
    }
  }

  ui.setAutoSaveEnabled(true)
  // 外部変更で止めていた場合も再開する（書く前に必ず照合し直すので、黙って上書きはしない）
  store().setAutoSavePaused(false)
  flashStatus(
    autoSaveTarget(store().filePath) === 'file'
      ? '自動保存をオンにしました。編集するたびにファイルへ保存します'
      : '自動保存をオンにしました。この端末ではブラウザ内に保存します（ファイルにするには「保存」）',
    4000,
  )
}

type ExportKind = 'pptx' | 'pdf' | 'png'

const EXPORT_LABEL: Record<ExportKind, string> = {
  pptx: 'PowerPoint 形式',
  pdf: 'PDF',
  png: 'PNG 画像',
}

/**
 * 書き出す範囲に絞った deck を作る。シートが複数あるファイルから 1 枚だけ出すときは、
 * ファイル名で見分けがつくよう「タイトル-シート名」にする。
 */
export function deckForExport(deck: Deck, scope: ExportScope): Deck {
  if (scope === 'all' || deck.sheets.length <= 1) return deck
  const sheet = activeSheetOf(deck)
  return { ...deck, title: `${deck.title}-${sheet.name}`, activeSheet: 0, sheets: [sheet] }
}

export async function exportDeck(kind: ExportKind): Promise<void> {
  const deck = deckForExport(store().deck, useUiStore.getState().exportScope)
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

// ---------------------------------------------------------------- シート

/** シートを削除する。Excel と同じく確認してから消す（「元に戻す」でも戻せる）。 */
export async function deleteSheet(index?: number): Promise<void> {
  const { deck } = store()
  if (deck.sheets.length <= 1) {
    flashStatus('シートが 1 枚のときは削除できません')
    return
  }
  const target = index ?? deck.activeSheet
  const sheet = deck.sheets[target]
  if (!sheet) return
  const ok = await platform.dialog.confirm({
    message: `シート「${sheet.name}」を削除しますか？`,
    detail: `このシートのスライド ${sheet.slides.length} 枚も一緒に削除されます。削除したあとでも「元に戻す」で戻せます。`,
    okLabel: '削除',
  })
  if (!ok) return
  if (store().deleteSheet(target)) flashStatus(`シート「${sheet.name}」を削除しました`)
}

/** 隣のシートへ移る（Ctrl+PageUp / Ctrl+PageDown）。端では止まる。 */
export function selectAdjacentSheet(step: -1 | 1): void {
  const { deck, selectSheet } = store()
  const target = deck.activeSheet + step
  if (target < 0 || target >= deck.sheets.length) return
  selectSheet(target)
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
