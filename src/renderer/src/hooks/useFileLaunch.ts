/**
 * 起動時にファイルを引き継ぐ処理。
 *
 * ・OS からファイルを指定して開かれた場合、そのパスを 1 度だけ取りに行く（Electron）
 * ・起動中に渡された場合はイベントで受け取る
 * ・どちらも無く、前回の下書きが残っていれば復元する（Web 版）
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { flashStatus } from '../store/uiStore'
import { openDeckPath } from '../lib/commands'
import { platform } from '../platform'

export function useFileLaunch(): void {
  useEffect(() => {
    let canceled = false

    void platform.deck.takePendingOpen().then(async (filePath) => {
      if (canceled) return
      if (filePath) {
        void openDeckPath(filePath)
        return
      }
      const draft = await platform.deck.restoreDraft?.()
      if (canceled || !draft) return
      // すでに何か開いている・編集している場合は上書きしない
      const store = useDeckStore.getState()
      if (store.dirty || store.filePath) return
      store.loadDeck(draft, null)
      useDeckStore.setState({ dirty: true })
      flashStatus('前回の下書きを復元しました', 4000)
    })

    const dispose = platform.onOpenRequested((filePath) => {
      void openDeckPath(filePath)
    })

    return () => {
      canceled = true
      dispose()
    }
  }, [])
}
