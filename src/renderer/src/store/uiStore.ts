/** 画面まわりの一時的な状態（デッキの内容ではないもの）。 */
import { create } from 'zustand'

export interface UiStore {
  presenting: boolean
  /** 画面右下に短時間出す通知。 */
  status: string | null
  setPresenting: (presenting: boolean) => void
  setStatus: (status: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  presenting: false,
  status: null,
  setPresenting: (presenting) => set({ presenting }),
  setStatus: (status) => set({ status }),
}))

let statusTimer: ReturnType<typeof setTimeout> | null = null

/** 一定時間で消える通知を出す。 */
export function flashStatus(message: string, durationMs = 2400): void {
  useUiStore.getState().setStatus(message)
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => useUiStore.getState().setStatus(null), durationMs)
}
