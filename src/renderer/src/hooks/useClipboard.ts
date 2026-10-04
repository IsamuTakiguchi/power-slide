/**
 * Ctrl+C / Ctrl+X / Ctrl+V（と Electron の「編集」メニュー）を、copy・cut・paste イベントで受ける。
 *
 * キー操作ではなくイベントで受けるのは、OS のクリップボードを読み書きするため
 * （Excel でコピーした範囲を貼ると表になる、表を Excel に貼れる、など）。
 * 入力欄・文字の編集中・表のセルの入力欄では、その入力欄に任せる。
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { copySelection, pasteContent } from '../lib/paste'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** 編集画面の操作として扱ってよいか（入力欄や発表中は除く）。 */
function canHandle(event: ClipboardEvent): boolean {
  if (useUiStore.getState().presenting) return false
  if (useDeckStore.getState().editingId) return false
  return !isTypingTarget(event.target) && !isTypingTarget(document.activeElement)
}

export function useClipboard(): void {
  useEffect(() => {
    const onCopyOrCut = (cut: boolean) => (event: ClipboardEvent) => {
      if (!canHandle(event) || !event.clipboardData) return
      const data = copySelection(cut)
      if (!data) return
      event.preventDefault()
      event.clipboardData.setData('text/plain', data.text)
      if (data.html) event.clipboardData.setData('text/html', data.html)
    }
    const onCopy = onCopyOrCut(false)
    const onCut = onCopyOrCut(true)

    const onPaste = (event: ClipboardEvent) => {
      if (!canHandle(event) || !event.clipboardData) return
      const data = event.clipboardData
      const image = Array.from(data.files).find((file) => file.type.startsWith('image/')) ?? null
      const pasted = pasteContent({
        text: data.getData('text/plain'),
        html: data.getData('text/html'),
        image,
      })
      if (pasted) event.preventDefault()
    }

    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])
}
