/**
 * 編集画面のキーボード操作。
 * テキスト編集中や入力欄にフォーカスがあるときは何もしない。
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { saveDeck } from '../lib/commands'

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

      if (meta) {
        switch (event.key.toLowerCase()) {
          case 'z':
            event.preventDefault()
            if (event.shiftKey) store.redo()
            else store.undo()
            return
          case 'c':
            event.preventDefault()
            store.copySelected()
            return
          case 'v':
            event.preventDefault()
            store.pasteClipboard()
            return
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
        case 'Enter': {
          // 選択中のテキスト要素を編集開始
          const [id] = store.selectedIds
          if (!id) return
          const slide = store.deck.slides[store.slideIndex]
          const element = slide?.elements.find((item) => item.id === id)
          if (element?.type === 'text') {
            event.preventDefault()
            store.setEditing(id)
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
