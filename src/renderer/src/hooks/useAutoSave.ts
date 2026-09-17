/**
 * 自動保存。
 *
 * 手で直したファイルを黙って潰さないことを最優先にしている:
 * ・保存先が未確定（新規デッキ）のときは自動保存しない
 * ・書き込む直前に main 側が mtime/サイズを照合し、アプリ外で変わっていたら上書きしない
 * ・その場合は自動保存を止め、ユーザーに「読み直す／上書きする／別名で保存する」を訊く
 */
import { useEffect, useRef } from 'react'
import { useDeckStore } from '../store/deckStore'
import { flashStatus } from '../store/uiStore'

/** 変更が止まってから保存するまでの待ち時間。 */
const DEBOUNCE_MS = 1500

export function useAutoSave(): void {
  const deck = useDeckStore((state) => state.deck)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const autoSavePaused = useDeckStore((state) => state.autoSavePaused)
  const inTransaction = useDeckStore((state) => state.inTransaction)

  /** 同時に 2 回走らせないための錠。 */
  const savingRef = useRef(false)

  useEffect(() => {
    if (!dirty || !filePath || autoSavePaused || inTransaction) return

    const timer = setTimeout(async () => {
      if (savingRef.current) return
      savingRef.current = true
      try {
        const state = useDeckStore.getState()
        const result = await window.api.deck.autoSave(state.deck, state.filePath)

        if (result.status === 'saved' && result.filePath) {
          // 自動保存の完了後にさらに編集されている場合があるので、
          // 保存した時点のデッキと今のデッキが同じときだけ「保存済み」にする
          if (useDeckStore.getState().deck === state.deck) {
            useDeckStore.getState().markSaved(result.filePath)
          }
          return
        }

        if (result.status === 'conflict' && result.filePath) {
          useDeckStore.getState().setAutoSavePaused(true)
          flashStatus('ファイルがアプリの外で変更されています', 6000)
          const resolution = await window.api.deck.resolveConflict(state.deck, result.filePath)
          const store = useDeckStore.getState()
          if (resolution.error) {
            await window.api.dialog.message({ type: 'error', message: resolution.error })
            return
          }
          switch (resolution.resolution) {
            case 'reload':
              if (resolution.deck && resolution.filePath) {
                store.loadDeck(resolution.deck, resolution.filePath)
                flashStatus('ディスクの内容を読み込みました')
              }
              break
            case 'overwrite':
              if (resolution.filePath) {
                store.markSaved(resolution.filePath)
                flashStatus('編集中の内容で上書きしました')
              }
              break
            case 'saveAs':
              if (resolution.filePath) {
                store.markSaved(resolution.filePath)
                flashStatus('別名で保存しました')
              }
              break
            case 'cancel':
              // 自動保存は止めたまま。ユーザーが手動保存するまで触らない。
              flashStatus('自動保存を止めました。保存は手動で行ってください。', 6000)
              break
          }
          return
        }

        if (result.status === 'error' && result.error) {
          useDeckStore.getState().setAutoSavePaused(true)
          await window.api.dialog.message({
            type: 'error',
            message: '自動保存に失敗しました。',
            detail: result.error,
          })
        }
      } finally {
        savingRef.current = false
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [deck, filePath, dirty, autoSavePaused, inTransaction])
}
