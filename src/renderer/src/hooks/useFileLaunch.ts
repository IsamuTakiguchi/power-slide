/**
 * OS からファイルを指定して開かれたときの処理。
 *
 * ・起動時に渡されたパスを 1 度だけ取りに行く（main が保持している）
 * ・起動中に渡された場合はイベントで受け取る
 */
import { useEffect } from 'react'
import { openDeckPath } from '../lib/commands'

export function useFileLaunch(): void {
  useEffect(() => {
    let canceled = false

    void window.api.deck.takePendingOpen().then((filePath) => {
      if (!canceled && filePath) void openDeckPath(filePath)
    })

    const dispose = window.api.onOpenRequested((filePath) => {
      void openDeckPath(filePath)
    })

    return () => {
      canceled = true
      dispose()
    }
  }, [])
}
