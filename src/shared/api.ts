/**
 * 画面（renderer）がプラットフォームに求める機能の契約。
 *
 * Electron では preload がこの形で `window.api` を公開し、
 * Web 版（PWA）では renderer 内のブラウザ実装がこれを満たす。
 * 画面側のコードはどちらかを意識せず、この型だけに依存する。
 */
import type { Deck } from './deck'
import type {
  AutoSaveResult,
  ConflictResult,
  ExportResult,
  MenuCommand,
  OpenDeckResult,
  PickedImage,
  RecentFile,
  SaveDeckResult,
} from './ipc'

export interface PlatformCapabilities {
  /** PNG の書き出しができるか（Web 版は未対応）。 */
  exportPng: boolean
  /** 保存先が未確定でも下書きを自動保存するか（Web 版はブラウザ内に保存する）。 */
  draftAutosave: boolean
  /** OS のファイルシステムに直接読み書きできるか。 */
  nativeFiles: boolean
}

export interface PowerSlideApi {
  capabilities: PlatformCapabilities
  deck: {
    open: () => Promise<OpenDeckResult>
    openPath: (filePath: string) => Promise<OpenDeckResult>
    save: (deck: Deck, filePath: string | null) => Promise<SaveDeckResult>
    saveAs: (deck: Deck) => Promise<SaveDeckResult>
    autoSave: (deck: Deck, filePath: string | null) => Promise<AutoSaveResult>
    resolveConflict: (deck: Deck, filePath: string) => Promise<ConflictResult>
    confirmDiscard: (message: string) => Promise<boolean>
    recent: () => Promise<RecentFile[]>
    /** OS からファイルを指定して起動された場合、そのパスを 1 度だけ受け取る。 */
    takePendingOpen: () => Promise<string | null>
    /** 前回の下書き（保存先のないまま閉じた内容）があれば返す。Web 版のみ。 */
    restoreDraft?: () => Promise<Deck | null>
  }
  exportDeck: {
    pptx: (deck: Deck) => Promise<ExportResult>
    pdf: (deck: Deck) => Promise<ExportResult>
    png: (deck: Deck) => Promise<ExportResult>
  }
  image: {
    pick: () => Promise<PickedImage>
  }
  presenter: {
    enter: () => Promise<void>
    exit: () => Promise<void>
  }
  window: {
    setTitle: (title: string) => Promise<void>
    /** 未保存の変更があるかを伝える（閉じる際の確認に使う）。 */
    setDirty: (dirty: boolean) => Promise<void>
  }
  dialog: {
    message: (payload: {
      type: 'info' | 'warning' | 'error'
      message: string
      detail?: string
    }) => Promise<void>
  }
  /** 起動中に OS からファイルを開くよう求められたときに呼ばれる。 */
  onOpenRequested: (handler: (filePath: string) => void) => () => void
  onMenuCommand: (handler: (command: MenuCommand) => void) => () => void
}
