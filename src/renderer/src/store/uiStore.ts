/** 画面まわりの一時的な状態（デッキの内容ではないもの）。 */
import { create } from 'zustand'

/** リボンのタブ。PowerPoint と同じ並びにしている。 */
export type RibbonTab = 'home' | 'insert' | 'design' | 'slideshow'

export interface UiStore {
  presenting: boolean
  /** 画面右下に短時間出す通知。 */
  status: string | null
  ribbonTab: RibbonTab
  /** 下部のノート欄を出しているか（ステータスバーの「ノート」で切り替える）。 */
  notesOpen: boolean
  /**
   * キャンバスの表示倍率（%）。null なら表示領域に合わせて自動で決める。
   * ステータスバーのズームスライダーから変える。
   */
  zoom: number | null
  /** 実際に適用されている倍率（%）。自動のときの値をステータスバーに出すため。 */
  effectiveZoom: number
  setPresenting: (presenting: boolean) => void
  setStatus: (status: string | null) => void
  setRibbonTab: (tab: RibbonTab) => void
  toggleNotes: () => void
  setZoom: (zoom: number | null) => void
  setEffectiveZoom: (zoom: number) => void
}

export const ZOOM_MIN = 25
export const ZOOM_MAX = 200

export const useUiStore = create<UiStore>((set) => ({
  presenting: false,
  status: null,
  ribbonTab: 'home',
  notesOpen: true,
  zoom: null,
  effectiveZoom: 100,
  setPresenting: (presenting) => set({ presenting }),
  setStatus: (status) => set({ status }),
  setRibbonTab: (ribbonTab) => set({ ribbonTab }),
  toggleNotes: () => set((state) => ({ notesOpen: !state.notesOpen })),
  setZoom: (zoom) =>
    set({ zoom: zoom === null ? null : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom))) }),
  setEffectiveZoom: (effectiveZoom) => set({ effectiveZoom }),
}))

let statusTimer: ReturnType<typeof setTimeout> | null = null

/** 一定時間で消える通知を出す。 */
export function flashStatus(message: string, durationMs = 2400): void {
  useUiStore.getState().setStatus(message)
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => useUiStore.getState().setStatus(null), durationMs)
}
