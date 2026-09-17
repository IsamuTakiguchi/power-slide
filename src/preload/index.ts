/**
 * preload。renderer に渡す API をここで絞る。
 * renderer からは fs / path / ipcRenderer を直接触れない。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { Deck } from '@shared/deck'
import {
  IPC,
  type AutoSaveResult,
  type ConflictResult,
  type ExportResult,
  type MenuCommand,
  type OpenDeckResult,
  type PickedImage,
  type RecentFile,
  type SaveDeckResult,
} from '@shared/ipc'

const api = {
  deck: {
    open: (): Promise<OpenDeckResult> => ipcRenderer.invoke(IPC.deckOpen),
    openPath: (filePath: string): Promise<OpenDeckResult> =>
      ipcRenderer.invoke(IPC.deckOpenPath, filePath),
    save: (deck: Deck, filePath: string | null): Promise<SaveDeckResult> =>
      ipcRenderer.invoke(IPC.deckSave, deck, filePath),
    saveAs: (deck: Deck): Promise<SaveDeckResult> => ipcRenderer.invoke(IPC.deckSaveAs, deck),
    autoSave: (deck: Deck, filePath: string | null): Promise<AutoSaveResult> =>
      ipcRenderer.invoke(IPC.deckAutoSave, deck, filePath),
    resolveConflict: (deck: Deck, filePath: string): Promise<ConflictResult> =>
      ipcRenderer.invoke(IPC.deckResolveConflict, deck, filePath),
    confirmDiscard: (message: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.deckConfirmDiscard, message),
    recent: (): Promise<RecentFile[]> => ipcRenderer.invoke(IPC.recentList),
  },
  exportDeck: {
    pptx: (deck: Deck): Promise<ExportResult> => ipcRenderer.invoke(IPC.exportPptx, deck),
    pdf: (deck: Deck): Promise<ExportResult> => ipcRenderer.invoke(IPC.exportPdf, deck),
    png: (deck: Deck): Promise<ExportResult> => ipcRenderer.invoke(IPC.exportPng, deck),
  },
  image: {
    pick: (): Promise<PickedImage> => ipcRenderer.invoke(IPC.imagePick),
  },
  presenter: {
    enter: (): Promise<void> => ipcRenderer.invoke(IPC.presenterEnter),
    exit: (): Promise<void> => ipcRenderer.invoke(IPC.presenterExit),
  },
  window: {
    setTitle: (title: string): Promise<void> => ipcRenderer.invoke(IPC.windowSetTitle, title),
    /** 未保存の変更があるかを main に伝える（ウィンドウを閉じる際の確認に使う）。 */
    setDirty: (dirty: boolean): Promise<void> => ipcRenderer.invoke(IPC.windowSetDirty, dirty),
  },
  dialog: {
    message: (payload: {
      type: 'info' | 'warning' | 'error'
      message: string
      detail?: string
    }): Promise<void> => ipcRenderer.invoke(IPC.showMessage, payload),
  },
  onMenuCommand: (handler: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: MenuCommand): void =>
      handler(command)
    ipcRenderer.on(IPC.menuCommand, listener)
    return () => ipcRenderer.off(IPC.menuCommand, listener)
  },
}

export type PowerSlideApi = typeof api

contextBridge.exposeInMainWorld('api', api)
