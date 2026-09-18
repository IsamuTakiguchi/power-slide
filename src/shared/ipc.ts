/**
 * main / preload / renderer で共有する IPC の契約。
 * チャンネル名と payload の型をここに集約し、実装のずれを型で防ぐ。
 */
import type { Deck } from './deck'

export const IPC = {
  deckNew: 'deck:new',
  deckOpen: 'deck:open',
  deckOpenPath: 'deck:openPath',
  deckTakePendingOpen: 'deck:takePendingOpen',
  /** main → renderer。OS からファイルを開くよう求められた。 */
  deckOpenRequested: 'deck:openRequested',
  deckSave: 'deck:save',
  deckSaveAs: 'deck:saveAs',
  deckAutoSave: 'deck:autoSave',
  deckResolveConflict: 'deck:resolveConflict',
  deckConfirmDiscard: 'deck:confirmDiscard',
  recentList: 'recent:list',
  exportPptx: 'export:pptx',
  exportPdf: 'export:pdf',
  exportPng: 'export:png',
  imagePick: 'image:pick',
  presenterEnter: 'presenter:enter',
  presenterExit: 'presenter:exit',
  windowSetTitle: 'window:setTitle',
  windowSetDirty: 'window:setDirty',
  menuCommand: 'menu:command',
  showMessage: 'dialog:message',
} as const

/**
 * 書き出し用ルート（`#/render`）への描画要求。
 * main が executeJavaScript で renderer に渡す。
 */
export interface RenderRequest {
  deck: Deck
  /** 'all' は全スライドを縦に並べる（PDF 用）、'single' は 1 枚だけ（PNG 用）。 */
  mode: 'all' | 'single'
  slideIndex?: number
}

export interface OpenDeckResult {
  canceled: boolean
  deck?: Deck
  filePath?: string
  /** 読み込めなかった場合の日本語メッセージ。 */
  error?: string
  /** SCHEMA_VERSION より新しいファイルを読んだ場合に立つ。 */
  schemaWarning?: string
}

export interface SaveDeckResult {
  canceled: boolean
  filePath?: string
  error?: string
}

/**
 * 自動保存の結果。
 * - `saved`: 上書きできた
 * - `skipped`: 保存先が未確定（新規デッキ）なので何もしなかった
 * - `conflict`: アプリ外でファイルが変更されていたため、上書きせず中断した
 */
export interface AutoSaveResult {
  status: 'saved' | 'skipped' | 'conflict' | 'error'
  filePath?: string
  error?: string
}

/** 外部変更が起きたときにユーザーへ問う選択肢。 */
export type ConflictResolution = 'reload' | 'overwrite' | 'saveAs' | 'cancel'

export interface ConflictResult {
  resolution: ConflictResolution
  /** reload を選んだ場合に読み直したデッキ。 */
  deck?: Deck
  /** saveAs を選んだ場合の新しい保存先。 */
  filePath?: string
  error?: string
}

export interface ExportResult {
  canceled: boolean
  /** 書き出したファイル（PNG は複数）。 */
  files?: string[]
  error?: string
}

export interface PickedImage {
  canceled: boolean
  dataUrl?: string
  mime?: string
  width?: number
  height?: number
  error?: string
}

/** アプリメニューから renderer へ送るコマンド。 */
export type MenuCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'exportPptx'
  | 'exportPdf'
  | 'exportPng'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'duplicate'
  | 'addSlide'
  | 'present'
  | 'insertText'
  | 'insertImage'
  | 'about'

export interface RecentFile {
  filePath: string
  title: string
}
