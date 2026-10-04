/**
 * 編集画面のキーボード操作。
 * テキスト編集中や入力欄にフォーカスがあるときは何もしない。
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { saveDeck, selectAdjacentSheet } from '../lib/commands'
import { activeSlides } from '@shared/deck'

/** Shift 併用時の移動量（論理 px）。 */
const NUDGE_LARGE = 10

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useUiStore.getState().presenting) return
      const store = useDeckStore.getState()
      if (store.editingId || isTypingTarget(event.target)) return

      const meta = event.metaKey || event.ctrlKey
      const step = event.shiftKey ? NUDGE_LARGE : 1

      // シートの操作は Excel と同じキー
      if (meta && (event.key === 'PageUp' || event.key === 'PageDown')) {
        event.preventDefault()
        selectAdjacentSheet(event.key === 'PageUp' ? -1 : 1)
        return
      }
      if (event.shiftKey && event.key === 'F11') {
        event.preventDefault()
        store.addSheet()
        return
      }

      if (meta) {
        switch (event.key.toLowerCase()) {
          case 'z':
            event.preventDefault()
            if (event.shiftKey) store.redo()
            else store.undo()
            return
          // Ctrl+C / Ctrl+X / Ctrl+V は useClipboard が copy・cut・paste イベントで受ける
          // （ここで止めると OS のクリップボードが読めず、Excel からの貼り付けができない）
          case 'd':
            event.preventDefault()
            store.duplicateSelected()
            return
          case 's':
            event.preventDefault()
            void saveDeck()
            return
          default:
            return
        }
      }

      // 表の中にいるときの操作は表の側（TableEditor）が受け持つ。入力欄から
      // フォーカスが外れていても、矢印で表そのものが動いたりしないようにする
      if (store.tableCursor && event.key !== 'Escape') return

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (store.selectedIds.length === 0) return
          event.preventDefault()
          store.deleteSelected()
          break
        case 'ArrowLeft':
          if (store.selectedIds.length === 0) return
          event.preventDefault()
          store.nudgeSelected(-step, 0)
          break
        case 'ArrowRight':
          if (store.selectedIds.length === 0) return
          event.preventDefault()
          store.nudgeSelected(step, 0)
          break
        case 'ArrowUp':
          if (store.selectedIds.length === 0) return
          event.preventDefault()
          store.nudgeSelected(0, -step)
          break
        case 'ArrowDown':
          if (store.selectedIds.length === 0) return
          event.preventDefault()
          store.nudgeSelected(0, step)
          break
        case 'Escape':
          store.clearSelection()
          break
        case 'Enter':
        case 'F2': {
          // 選択中のテキストは文字編集、表は表の中の操作を始める（F2 はセルの編集から）
          const [id] = store.selectedIds
          if (!id || store.selectedIds.length !== 1) return
          const slide = activeSlides(store.deck)[store.slideIndex]
          const element = slide?.elements.find((item) => item.id === id)
          if (element?.type === 'text') {
            event.preventDefault()
            store.setEditing(id)
          } else if (element?.type === 'table') {
            event.preventDefault()
            store.enterTable(id, { row: 0, col: 0 }, event.key === 'F2')
          }
          break
        }
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
