/** アプリメニューから届くコマンドを 1 か所で処理する。 */
import { useEffect } from 'react'
import type { MenuCommand } from '@shared/ipc'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import {
  exportDeck,
  insertImage,
  insertTextBox,
  newDeck,
  openDeck,
  saveDeck,
  saveDeckAs,
  startPresenting,
} from '../lib/commands'

export function useMenuCommands(): void {
  useEffect(() => {
    const handle = (command: MenuCommand): void => {
      const store = useDeckStore.getState()
      switch (command) {
        case 'new':
          void newDeck()
          break
        case 'open':
          void openDeck()
          break
        case 'save':
          void saveDeck()
          break
        case 'saveAs':
          void saveDeckAs()
          break
        case 'exportPptx':
          void exportDeck('pptx')
          break
        case 'exportPdf':
          void exportDeck('pdf')
          break
        case 'exportPng':
          void exportDeck('png')
          break
        case 'undo':
          store.undo()
          break
        case 'redo':
          store.redo()
          break
        case 'delete':
          store.deleteSelected()
          break
        case 'duplicate':
          if (store.selectedIds.length > 0) store.duplicateSelected()
          else store.duplicateSlide()
          break
        case 'addSlide':
          store.addSlide('titleBody')
          break
        case 'present':
          void startPresenting()
          break
        case 'insertText':
          insertTextBox()
          break
        case 'insertImage':
          void insertImage()
          break
        case 'about':
          void window.api.dialog.message({
            type: 'info',
            message: 'Power Slide',
            detail:
              'PowerPoint 風のスライドを作成・発表・書き出しできるデスクトップアプリです。\n' +
              '保存形式: .pslide / 書き出し: .pptx, PDF, PNG',
          })
          break
      }
    }

    const dispose = window.api.onMenuCommand((command) => {
      // 発表中はスライド操作系のコマンドを受け付けない
      if (useUiStore.getState().presenting && command !== 'about') return
      handle(command)
    })
    return dispose
  }, [])
}
