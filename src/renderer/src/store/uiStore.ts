/** 画面まわりの一時的な状態（デッキの内容ではないもの）。 */
import { create } from 'zustand'

/** リボンのタブ。PowerPoint と同じ並びにしている。 */
export type RibbonTab = 'home' | 'insert' | 'design' | 'slideshow'

/**
 * 画面の広さの段階。幅で自動的に決まる（AppShell が matchMedia で見ている）。
 *
 * - desktop: PC。3 ペインのリボン UI そのまま
 * - tablet: リボンを 1 行のボタン列にまとめ、書式設定は下から出るシートにする
 * - phone: さらにリボンとタブを画面下（親指の届く位置）に移し、スライド一覧を下の帯にする
 */
export type LayoutKind = 'desktop' | 'tablet' | 'phone'

export interface UiStore {
  presenting: boolean
  /** 画面右下に短時間出す通知。 */
  status: string | null
  ribbonTab: RibbonTab
  /**
   * リボンの中身をたたんでいるか（タブだけ残す）。PowerPoint と同じで、
   * 選んでいるタブをもう一度押すか、右端のボタンで切り替える。画面が低いときに効く。
   */
  ribbonCollapsed: boolean
  /** 下部のノート欄を出しているか（ステータスバーの「ノート」で切り替える）。 */
  notesOpen: boolean
  /** 右の「書式設定」を出しているか。狭い画面ではシートとして重ねる。 */
  inspectorOpen: boolean
  /** 画面の広さの段階。 */
  layout: LayoutKind
  /** タブレット以下か（desktop 以外）。シート表示やリボンの折りたたみの判定に使う。 */
  compact: boolean
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
  toggleRibbon: () => void
  toggleNotes: () => void
  toggleInspector: () => void
  setLayout: (layout: LayoutKind) => void
  setZoom: (zoom: number | null) => void
  setEffectiveZoom: (zoom: number) => void
}

export const ZOOM_MIN = 25
export const ZOOM_MAX = 200

export const useUiStore = create<UiStore>((set) => ({
  presenting: false,
  status: null,
  ribbonTab: 'home',
  ribbonCollapsed: false,
  notesOpen: true,
  inspectorOpen: true,
  layout: 'desktop',
  compact: false,
  zoom: null,
  effectiveZoom: 100,
  setPresenting: (presenting) => set({ presenting }),
  setStatus: (status) => set({ status }),
  // 別のタブを選んだときは、たたんでいたリボンを開く
  setRibbonTab: (ribbonTab) => set({ ribbonTab, ribbonCollapsed: false }),
  toggleRibbon: () => set((state) => ({ ribbonCollapsed: !state.ribbonCollapsed })),
  toggleNotes: () => set((state) => ({ notesOpen: !state.notesOpen })),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setLayout: (layout) =>
    set((state) => {
      if (state.layout === layout) return state
      const compact = layout !== 'desktop'
      if (compact === state.compact) return { layout }
      // 狭い画面に切り替わったときはノートと書式設定をたたみ、広くなったら戻す
      return { layout, compact, notesOpen: !compact, inspectorOpen: !compact }
    }),
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
