/**
 * Web 版（ブラウザ / PWA）のプラットフォーム実装。Electron の preload と同じ契約を満たす。
 *
 * ファイルの扱いはブラウザの対応状況で 2 段構え:
 * - File System Access API があるブラウザ（Chrome / Edge / Android Chrome）では
 *   ファイルハンドルを保持して上書き保存・自動保存・最近使ったファイルからの再開ができる
 * - 無いブラウザ（iOS Safari など）ではダウンロード／ファイル選択で受け渡しし、
 *   編集中の内容はブラウザ内（IndexedDB）に下書きとして残す
 *
 * pptx はブラウザ内で組み立ててダウンロード、PDF はブラウザの印刷機能に渡す。
 */
import type { Deck } from '@shared/deck'
import { FILE_EXTENSION } from '@shared/deck'
import type { PowerSlideApi } from '@shared/api'
import type {
  AutoSaveResult,
  ConflictResult,
  ExportResult,
  OpenDeckResult,
  PickedImage,
  RecentFile,
  RenderRequest,
  SaveDeckResult,
} from '@shared/ipc'
import { normalizeDeck, parseDeck, serializeDeck } from '@shared/deckFile'
import { buildPptx } from '@shared/pptx'
import { idbGet, idbSet } from './idb'

const DRAFT_KEY = 'draft'
const RECENT_KEY = 'recent'
const HANDLE_PREFIX = 'handle:'
const MAX_RECENT = 10

/** ブラウザ内に残す下書き。clean はファイルにも同じ内容が書けているか。 */
interface Draft {
  deck: Deck
  clean: boolean
  savedAt: number
}

// File System Access API の型は lib.dom に揃っていないので、使う分だけ自前で持つ
interface FsWritable {
  write(data: string | Blob): Promise<void>
  close(): Promise<void>
}

interface FsFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<FsWritable>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface PickerOptions {
  suggestedName?: string
  multiple?: boolean
  types?: { description: string; accept: Record<string, string[]> }[]
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FsFileHandle[]>
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FsFileHandle>
  launchQueue?: {
    setConsumer: (consumer: (params: { files: FsFileHandle[] }) => void) => void
  }
}

const PICKER_TYPES: PickerOptions['types'] = [
  { description: 'Power Slide プレゼンテーション', accept: { 'application/json': [`.${FILE_EXTENSION}`] } },
]

function pickerWindow(): PickerWindow {
  return window as PickerWindow
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// ------------------------------------------------------------ ファイルハンドルの管理

/** 表示名（ファイル名）→ ハンドル。ページを閉じると消えるので IndexedDB にも置く。 */
const handles = new Map<string, FsFileHandle>()

/** アプリ自身が最後に読み書きした時点の lastModified。外部変更の検知に使う。 */
const stamps = new Map<string, number>()

async function ensurePermission(handle: FsFileHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true
  const options = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(options)) === 'granted') return true
  return (await handle.requestPermission(options)) === 'granted'
}

async function readHandle(handle: FsFileHandle): Promise<OpenDeckResult> {
  const file = await handle.getFile()
  const { deck, schemaWarning } = parseDeck(await file.text())
  handles.set(handle.name, handle)
  stamps.set(handle.name, file.lastModified)
  await rememberRecent(handle, deck.title)
  return { canceled: false, deck, filePath: handle.name, schemaWarning }
}

async function writeHandle(handle: FsFileHandle, deck: Deck): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(serializeDeck(deck))
  await writable.close()
  const file = await handle.getFile()
  stamps.set(handle.name, file.lastModified)
}

async function isExternallyChanged(handle: FsFileHandle): Promise<boolean> {
  const known = stamps.get(handle.name)
  if (known === undefined) return true
  const file = await handle.getFile()
  return file.lastModified !== known
}

async function findHandle(filePath: string): Promise<FsFileHandle | null> {
  const cached = handles.get(filePath)
  if (cached) return cached
  const stored = await idbGet<FsFileHandle>(HANDLE_PREFIX + filePath).catch(() => undefined)
  if (stored) handles.set(filePath, stored)
  return stored ?? null
}

async function rememberRecent(handle: FsFileHandle, title: string): Promise<void> {
  try {
    const current = (await idbGet<RecentFile[]>(RECENT_KEY)) ?? []
    const next = [
      { filePath: handle.name, title },
      ...current.filter((item) => item.filePath !== handle.name),
    ].slice(0, MAX_RECENT)
    await idbSet(RECENT_KEY, next)
    await idbSet(HANDLE_PREFIX + handle.name, handle)
  } catch {
    // 履歴の保存に失敗しても本体の動作は止めない
  }
}

async function saveDraft(deck: Deck, clean: boolean): Promise<void> {
  const draft: Draft = { deck, clean, savedAt: Date.now() }
  await idbSet(DRAFT_KEY, draft).catch(() => undefined)
}

// ------------------------------------------------------------ ダウンロード／選択

function suggestedFileName(deck: Deck, extension: string): string {
  const base = deck.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'presentation'
  return `${base}.${extension}`
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // 読み込みが始まってから URL を無効にする
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** ファイル選択ダイアログを出し、選ばれたファイルを返す（キャンセルなら null）。 */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.append(input)
    const finish = (file: File | null) => {
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // キャンセルは change が来ないので、フォーカスが戻ったあと少し待って判断する
    input.addEventListener('cancel', () => finish(null))
    input.click()
  })
}

// ------------------------------------------------------------ PDF（印刷）

/**
 * 書き出し用ルート（#/render）を隠し iframe に読み込み、全スライドを描かせてから印刷する。
 * ブラウザの印刷ダイアログで「PDF に保存」を選んでもらう。
 */
async function printDeck(deck: Deck): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.opacity = '0'
  iframe.setAttribute('aria-hidden', 'true')
  const url = new URL(window.location.href)
  url.hash = '#/render'
  iframe.src = url.toString()
  document.body.append(iframe)

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.addEventListener('error', () => reject(new Error('印刷用の画面を読み込めませんでした。')), {
        once: true,
      })
    })
    const target = iframe.contentWindow as (Window & typeof globalThis) | null
    if (!target) throw new Error('印刷用の画面を読み込めませんでした。')
    // load 直後は React の effect がまだ走っておらず描画関数が無いことがあるので、現れるまで待つ
    const started = Date.now()
    while (!target.__psRenderSlide || !target.__psWhenRendered) {
      if (Date.now() - started > 10_000) throw new Error('印刷用の描画関数が見つかりませんでした。')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const request: RenderRequest = { deck, mode: 'all' }
    target.__psRenderSlide(request)
    await target.__psWhenRendered()
    target.focus()
    target.print()
  } finally {
    // 印刷ダイアログが閉じたあとに片付ける（同期的に消すと印刷が始まらないブラウザがある）
    setTimeout(() => iframe.remove(), 60_000)
  }
}

// ------------------------------------------------------------ 未保存の警告

let dirtyFlag = false
window.addEventListener('beforeunload', (event) => {
  if (!dirtyFlag) return
  event.preventDefault()
})

// ------------------------------------------------------------ API

export function createWebPlatform(): PowerSlideApi {
  return {
    capabilities: { exportPng: false, draftAutosave: true, nativeFiles: false },

    deck: {
      async open(): Promise<OpenDeckResult> {
        try {
          const picker = pickerWindow().showOpenFilePicker
          if (picker) {
            const [handle] = await picker({ types: PICKER_TYPES, multiple: false })
            if (!handle) return { canceled: true }
            return await readHandle(handle)
          }
          const file = await pickFile(`.${FILE_EXTENSION},application/json`)
          if (!file) return { canceled: true }
          const { deck, schemaWarning } = parseDeck(await file.text())
          return { canceled: false, deck, filePath: file.name, schemaWarning }
        } catch (error) {
          if (isAbort(error)) return { canceled: true }
          return { canceled: false, error: errorMessage(error, 'ファイルを開けませんでした。') }
        }
      },

      async openPath(filePath): Promise<OpenDeckResult> {
        const handle = await findHandle(filePath)
        if (!handle) {
          return {
            canceled: false,
            error: 'このファイルへの参照が残っていません。「開く」からもう一度選んでください。',
          }
        }
        try {
          if (!(await ensurePermission(handle))) return { canceled: true }
          return await readHandle(handle)
        } catch (error) {
          return { canceled: false, error: errorMessage(error, 'ファイルを開けませんでした。') }
        }
      },

      async save(deck, filePath): Promise<SaveDeckResult> {
        if (!filePath) return this.saveAs(deck)
        const handle = await findHandle(filePath)
        try {
          if (handle) {
            if (!(await ensurePermission(handle))) return { canceled: true }
            await writeHandle(handle, deck)
            await rememberRecent(handle, deck.title)
            await saveDraft(deck, true)
            return { canceled: false, filePath: handle.name }
          }
          // ハンドルの無いブラウザではダウンロードで渡す
          downloadBlob(filePath, new Blob([serializeDeck(deck)], { type: 'application/json' }))
          await saveDraft(deck, false)
          return { canceled: false, filePath }
        } catch (error) {
          if (isAbort(error)) return { canceled: true }
          return { canceled: false, error: errorMessage(error, '保存できませんでした。') }
        }
      },

      async saveAs(deck): Promise<SaveDeckResult> {
        const name = suggestedFileName(deck, FILE_EXTENSION)
        try {
          const picker = pickerWindow().showSaveFilePicker
          if (picker) {
            const handle = await picker({ suggestedName: name, types: PICKER_TYPES })
            await writeHandle(handle, deck)
            handles.set(handle.name, handle)
            await rememberRecent(handle, deck.title)
            await saveDraft(deck, true)
            return { canceled: false, filePath: handle.name }
          }
          downloadBlob(name, new Blob([serializeDeck(deck)], { type: 'application/json' }))
          await saveDraft(deck, false)
          return { canceled: false, filePath: name }
        } catch (error) {
          if (isAbort(error)) return { canceled: true }
          return { canceled: false, error: errorMessage(error, '保存できませんでした。') }
        }
      },

      async autoSave(deck, filePath): Promise<AutoSaveResult> {
        const handle = filePath ? await findHandle(filePath) : null
        if (!handle) {
          // 保存先が無い（または触れない）ときはブラウザ内の下書きだけ更新する
          await saveDraft(deck, false)
          return { status: 'skipped' }
        }
        try {
          if (await isExternallyChanged(handle)) {
            await saveDraft(deck, false)
            return { status: 'conflict', filePath: handle.name }
          }
          await writeHandle(handle, deck)
          await saveDraft(deck, true)
          return { status: 'saved', filePath: handle.name }
        } catch (error) {
          await saveDraft(deck, false)
          return { status: 'error', error: errorMessage(error, '自動保存に失敗しました。') }
        }
      },

      async resolveConflict(deck, filePath): Promise<ConflictResult> {
        const handle = await findHandle(filePath)
        if (!handle) return { resolution: 'cancel' }
        const reload = window.confirm(
          'ファイルがアプリの外で変更されています。\n\n' +
            'OK: ファイルの内容を読み直す（編集中の内容は失われます）\n' +
            'キャンセル: 編集中の内容でファイルを上書きする',
        )
        try {
          if (reload) {
            const result = await readHandle(handle)
            return { resolution: 'reload', deck: result.deck, filePath: handle.name }
          }
          await writeHandle(handle, deck)
          return { resolution: 'overwrite', filePath: handle.name }
        } catch (error) {
          return { resolution: 'cancel', error: errorMessage(error, '処理できませんでした。') }
        }
      },

      confirmDiscard: async (message) => window.confirm(message),

      recent: async () => (await idbGet<RecentFile[]>(RECENT_KEY).catch(() => undefined)) ?? [],

      takePendingOpen: async () => null,

      async restoreDraft(): Promise<Deck | null> {
        const draft = await idbGet<Draft>(DRAFT_KEY).catch(() => undefined)
        if (!draft || draft.clean) return null
        try {
          return normalizeDeck(draft.deck).deck
        } catch {
          return null
        }
      },
    },

    exportDeck: {
      async pptx(deck): Promise<ExportResult> {
        try {
          const blob = (await buildPptx(deck).write({ outputType: 'blob' })) as Blob
          const name = suggestedFileName(deck, 'pptx')
          downloadBlob(name, blob)
          return { canceled: false, files: [name] }
        } catch (error) {
          return { canceled: false, error: errorMessage(error, 'PowerPoint 形式の書き出しに失敗しました。') }
        }
      },
      async pdf(deck): Promise<ExportResult> {
        try {
          await printDeck(deck)
          return { canceled: false, files: [] }
        } catch (error) {
          return { canceled: false, error: errorMessage(error, 'PDF の書き出しに失敗しました。') }
        }
      },
      async png(): Promise<ExportResult> {
        return { canceled: false, error: 'PNG の書き出しはデスクトップ版でのみ使えます。' }
      },
    },

    image: {
      async pick(): Promise<PickedImage> {
        const file = await pickFile('image/*')
        if (!file) return { canceled: true }
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error ?? new Error('画像を読み込めませんでした。'))
            reader.readAsDataURL(file)
          })
          const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
            image.onerror = () => reject(new Error('画像として読み込めませんでした。'))
            image.src = dataUrl
          })
          return { canceled: false, dataUrl, mime: file.type || 'image/png', ...size }
        } catch (error) {
          return { canceled: false, error: errorMessage(error, '画像を読み込めませんでした。') }
        }
      },
    },

    presenter: {
      async enter() {
        // iPhone の Safari は全画面 API を持たないので、失敗しても発表自体は続ける
        await document.documentElement.requestFullscreen?.().catch(() => undefined)
      },
      async exit() {
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      },
    },

    window: {
      async setTitle(title) {
        document.title = title
      },
      async setDirty(dirty) {
        dirtyFlag = dirty
      },
    },

    dialog: {
      async message({ message, detail }) {
        window.alert(detail ? `${message}\n\n${detail}` : message)
      },
    },

    onOpenRequested(handler) {
      // PWA の「ファイルを開くアプリ」に選ばれたとき（manifest の file_handlers）
      pickerWindow().launchQueue?.setConsumer((params) => {
        for (const handle of params.files) {
          handles.set(handle.name, handle)
          handler(handle.name)
        }
      })
      return () => undefined
    },

    onMenuCommand() {
      // ブラウザにはアプリメニューが無い。ショートカットは画面側で処理する
      return () => undefined
    },
  }
}
