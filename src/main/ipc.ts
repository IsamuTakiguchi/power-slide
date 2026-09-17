/**
 * IPC ハンドラの登録をここに集約する。
 * renderer からはすべて `window.api` 経由で呼ばれる（preload/index.ts）。
 */
import { dialog, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import {
  IPC,
  type AutoSaveResult,
  type ConflictResult,
  type ExportResult,
  type OpenDeckResult,
  type PickedImage,
  type RecentFile,
  type SaveDeckResult,
} from '@shared/ipc'
import { FILE_EXTENSION, type Deck } from '@shared/deck'
import { forgetStamp, isExternallyChanged, readDeck, writeDeck } from './file/deckFile'
import { deckToPptxBuffer } from './export/pptx'
import { exportDeckToPdf } from './export/pdf'
import { exportDeckToPng } from './export/png'

const FILE_FILTER = { name: 'Power Slide', extensions: [FILE_EXTENSION] }
const MAX_RECENT = 10

type WindowProvider = () => BrowserWindow | null

function recentFilePath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

async function loadRecent(): Promise<RecentFile[]> {
  try {
    const text = await readFile(recentFilePath(), 'utf8')
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is RecentFile =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentFile).filePath === 'string',
      )
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

async function rememberRecent(filePath: string, title: string): Promise<void> {
  const current = await loadRecent()
  const next = [{ filePath, title }, ...current.filter((item) => item.filePath !== filePath)].slice(
    0,
    MAX_RECENT,
  )
  try {
    await writeFile(recentFilePath(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // 履歴の保存に失敗しても本体の動作は止めない
  }
  app.addRecentDocument(filePath)
}

/**
 * renderer から同期してもらう「未保存の変更がある」状態。
 * ウィンドウを閉じるときの確認に使う（renderer の beforeunload ではネイティブの
 * 確認ダイアログを出せないため、main 側で判断する）。
 */
let unsavedChanges = false

export function hasUnsavedChanges(): boolean {
  return unsavedChanges
}

export function clearUnsavedChanges(): void {
  unsavedChanges = false
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 保存ダイアログの初期ファイル名を作る。 */
function suggestedFileName(deck: Deck, extension: string): string {
  const safe = deck.title.replace(/[\\/:*?"<>|]/g, '_').trim() || '無題のプレゼンテーション'
  return `${safe}.${extension}`
}

async function askSavePath(
  window: BrowserWindow | null,
  defaultPath: string,
  filters: Electron.FileFilter[],
): Promise<string | null> {
  const result = window
    ? await dialog.showSaveDialog(window, { defaultPath, filters })
    : await dialog.showSaveDialog({ defaultPath, filters })
  return result.canceled || !result.filePath ? null : result.filePath
}

export function registerIpcHandlers(getWindow: WindowProvider): void {
  // ---------------------------------------------------------------- 開く

  ipcMain.handle(IPC.deckOpen, async (): Promise<OpenDeckResult> => {
    const window = getWindow()
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [FILE_FILTER] })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: [FILE_FILTER] })
    if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }
    return openPath(picked.filePaths[0])
  })

  ipcMain.handle(IPC.deckOpenPath, async (_event, filePath: string): Promise<OpenDeckResult> =>
    openPath(filePath),
  )

  async function openPath(filePath: string): Promise<OpenDeckResult> {
    try {
      const { deck, schemaWarning } = await readDeck(filePath)
      await rememberRecent(filePath, deck.title)
      return { canceled: false, deck, filePath, schemaWarning }
    } catch (error) {
      return { canceled: false, error: `ファイルを開けませんでした。\n${errorMessage(error)}` }
    }
  }

  // ---------------------------------------------------------------- 保存

  ipcMain.handle(
    IPC.deckSave,
    async (_event, deck: Deck, filePath: string | null): Promise<SaveDeckResult> => {
      const target = filePath ?? (await askSavePath(getWindow(), suggestedFileName(deck, FILE_EXTENSION), [FILE_FILTER]))
      if (!target) return { canceled: true }
      try {
        await writeDeck(target, deck)
        await rememberRecent(target, deck.title)
        return { canceled: false, filePath: target }
      } catch (error) {
        return { canceled: false, error: `保存できませんでした。\n${errorMessage(error)}` }
      }
    },
  )

  ipcMain.handle(IPC.deckSaveAs, async (_event, deck: Deck): Promise<SaveDeckResult> => {
    const target = await askSavePath(getWindow(), suggestedFileName(deck, FILE_EXTENSION), [FILE_FILTER])
    if (!target) return { canceled: true }
    try {
      await writeDeck(target, deck)
      await rememberRecent(target, deck.title)
      return { canceled: false, filePath: target }
    } catch (error) {
      return { canceled: false, error: `保存できませんでした。\n${errorMessage(error)}` }
    }
  })

  /**
   * 自動保存。保存先が確定していて、かつアプリ外で書き換えられていない場合のみ上書きする。
   * 手で直したファイルを黙って潰さないことを優先する。
   */
  ipcMain.handle(
    IPC.deckAutoSave,
    async (_event, deck: Deck, filePath: string | null): Promise<AutoSaveResult> => {
      if (!filePath) return { status: 'skipped' }
      try {
        if (await isExternallyChanged(filePath)) {
          return { status: 'conflict', filePath }
        }
        await writeDeck(filePath, deck)
        return { status: 'saved', filePath }
      } catch (error) {
        return { status: 'error', filePath, error: errorMessage(error) }
      }
    },
  )

  /** 外部変更が見つかったときの選択ダイアログ。 */
  ipcMain.handle(
    IPC.deckResolveConflict,
    async (_event, deck: Deck, filePath: string): Promise<ConflictResult> => {
      const window = getWindow()
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['ディスクの内容を読み込む', '編集中の内容で上書きする', '別名で保存する', 'キャンセル'],
        defaultId: 0,
        cancelId: 3,
        title: 'ファイルが変更されています',
        message: `${basename(filePath)} はこのアプリの外で変更されています。`,
        detail: '自動保存を止めました。どうするか選んでください。',
        noLink: true,
      }
      const { response } = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options)

      if (response === 0) {
        try {
          const { deck: reloaded } = await readDeck(filePath)
          return { resolution: 'reload', deck: reloaded, filePath }
        } catch (error) {
          return { resolution: 'cancel', error: `読み込めませんでした。\n${errorMessage(error)}` }
        }
      }
      if (response === 1) {
        try {
          await writeDeck(filePath, deck)
          return { resolution: 'overwrite', filePath }
        } catch (error) {
          return { resolution: 'cancel', error: `上書きできませんでした。\n${errorMessage(error)}` }
        }
      }
      if (response === 2) {
        const target = await askSavePath(window, suggestedFileName(deck, FILE_EXTENSION), [FILE_FILTER])
        if (!target) return { resolution: 'cancel' }
        try {
          forgetStamp(filePath)
          await writeDeck(target, deck)
          await rememberRecent(target, deck.title)
          return { resolution: 'saveAs', filePath: target }
        } catch (error) {
          return { resolution: 'cancel', error: `保存できませんでした。\n${errorMessage(error)}` }
        }
      }
      return { resolution: 'cancel' }
    },
  )

  ipcMain.handle(IPC.deckConfirmDiscard, async (_event, message: string): Promise<boolean> => {
    const window = getWindow()
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['破棄して続ける', 'キャンセル'],
      defaultId: 1,
      cancelId: 1,
      title: '保存されていない変更があります',
      message,
      noLink: true,
    }
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    return response === 0
  })

  ipcMain.handle(IPC.recentList, async (): Promise<RecentFile[]> => loadRecent())

  // ---------------------------------------------------------------- 書き出し

  ipcMain.handle(IPC.exportPptx, async (_event, deck: Deck): Promise<ExportResult> => {
    const target = await askSavePath(getWindow(), suggestedFileName(deck, 'pptx'), [
      { name: 'PowerPoint', extensions: ['pptx'] },
    ])
    if (!target) return { canceled: true }
    try {
      const buffer = await deckToPptxBuffer(deck)
      await writeFile(target, buffer)
      return { canceled: false, files: [target] }
    } catch (error) {
      return { canceled: false, error: `PowerPoint 形式で書き出せませんでした。\n${errorMessage(error)}` }
    }
  })

  ipcMain.handle(IPC.exportPdf, async (_event, deck: Deck): Promise<ExportResult> => {
    const target = await askSavePath(getWindow(), suggestedFileName(deck, 'pdf'), [
      { name: 'PDF', extensions: ['pdf'] },
    ])
    if (!target) return { canceled: true }
    try {
      await exportDeckToPdf(deck, target)
      return { canceled: false, files: [target] }
    } catch (error) {
      return { canceled: false, error: `PDF を書き出せませんでした。\n${errorMessage(error)}` }
    }
  })

  ipcMain.handle(IPC.exportPng, async (_event, deck: Deck): Promise<ExportResult> => {
    const window = getWindow()
    const picked = window
      ? await dialog.showOpenDialog(window, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'PNG の保存先フォルダ',
          buttonLabel: 'ここに書き出す',
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }
    try {
      const files = await exportDeckToPng(deck, picked.filePaths[0])
      return { canceled: false, files }
    } catch (error) {
      return { canceled: false, error: `PNG を書き出せませんでした。\n${errorMessage(error)}` }
    }
  })

  // ---------------------------------------------------------------- 画像挿入

  ipcMain.handle(IPC.imagePick, async (): Promise<PickedImage> => {
    const window = getWindow()
    const filters = [{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    const picked = window
      ? await dialog.showOpenDialog(window, { properties: ['openFile'], filters })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (picked.canceled || picked.filePaths.length === 0) return { canceled: true }

    const filePath = picked.filePaths[0]
    try {
      const image = nativeImage.createFromPath(filePath)
      if (image.isEmpty()) throw new Error('画像として読み込めませんでした。')
      const size = image.getSize()
      const bytes = await readFile(filePath)
      const mime = mimeFromExtension(extname(filePath))
      return {
        canceled: false,
        dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
        mime,
        width: size.width,
        height: size.height,
      }
    } catch (error) {
      return { canceled: false, error: `画像を読み込めませんでした。\n${errorMessage(error)}` }
    }
  })

  // ---------------------------------------------------------------- 発表・ウィンドウ

  ipcMain.handle(IPC.presenterEnter, () => {
    const window = getWindow()
    if (!window) return
    window.setFullScreen(true)
    window.setMenuBarVisibility(false)
  })

  ipcMain.handle(IPC.presenterExit, () => {
    const window = getWindow()
    if (!window) return
    window.setFullScreen(false)
    window.setMenuBarVisibility(true)
  })

  ipcMain.handle(IPC.windowSetTitle, (_event, title: string) => {
    getWindow()?.setTitle(title)
  })

  ipcMain.handle(IPC.windowSetDirty, (_event, dirty: boolean) => {
    unsavedChanges = dirty
  })

  ipcMain.handle(
    IPC.showMessage,
    async (_event, payload: { type: 'info' | 'warning' | 'error'; message: string; detail?: string }) => {
      const window = getWindow()
      const options: Electron.MessageBoxOptions = {
        type: payload.type,
        buttons: ['OK'],
        message: payload.message,
        detail: payload.detail,
        noLink: true,
      }
      if (window) await dialog.showMessageBox(window, options)
      else await dialog.showMessageBox(options)
    },
  )
}

function mimeFromExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'image/png'
  }
}
