/**
 * デッキの状態管理。
 *
 * 履歴はスナップショット方式（deck 全体を structuredClone して積む）。
 * 要素数が数百程度ならコストは無視でき、パッチ方式より壊れにくい。
 * ドラッグ中の連続更新は pushHistory() + editLive() で 1 エントリにまとめる。
 */
import { create } from 'zustand'
import {
  createSlide,
  type Deck,
  type Slide,
  type SlideElement,
  type Theme,
} from '@shared/deck'
import { buildSlideFromLayout, createStarterDeck, DEFAULT_LAYOUT_ID } from '@shared/layouts'
import { newId } from '@shared/id'
import { resolveTheme } from '@shared/themes'
import { clamp, SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'

const HISTORY_LIMIT = 50

/** 複製・貼り付け時のずらし量。 */
const PASTE_OFFSET = 24

export interface DeckStore {
  deck: Deck
  filePath: string | null
  dirty: boolean
  /** 外部変更を検知した後、ユーザーが判断するまで自動保存を止める。 */
  autoSavePaused: boolean
  slideIndex: number
  selectedIds: string[]
  /** インライン編集中のテキスト要素。 */
  editingId: string | null
  clipboard: SlideElement[]
  past: Deck[]
  future: Deck[]
  /** ドラッグ中は true。この間 editLive() は履歴を積まない。 */
  inTransaction: boolean
  /** 最後に「新しいスライド」で使ったレイアウト。次回の既定にする。 */
  lastLayoutId: string

  // ---- 基本操作
  /** 履歴を 1 段積んでから deck を書き換える。 */
  edit: (recipe: (deck: Deck) => void) => void
  /** 履歴を積まずに書き換える（ドラッグ中の連続更新用）。 */
  editLive: (recipe: (deck: Deck) => void) => void
  /** ドラッグ開始時に 1 回だけ呼び、現状を履歴に積む。 */
  pushHistory: () => void
  endTransaction: () => void
  undo: () => void
  redo: () => void

  // ---- ファイル
  loadDeck: (deck: Deck, filePath: string | null) => void
  resetDeck: () => void
  markSaved: (filePath: string) => void
  setAutoSavePaused: (paused: boolean) => void

  // ---- 選択
  selectSlide: (index: number) => void
  select: (ids: string[]) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  setEditing: (id: string | null) => void

  // ---- スライド
  addSlide: (layoutId: string) => void
  duplicateSlide: (index?: number) => void
  deleteSlide: (index?: number) => void
  moveSlide: (from: number, to: number) => void
  setNotes: (notes: string) => void
  setSlideBackground: (color: string | null) => void

  // ---- 要素
  addElement: (element: SlideElement) => void
  updateElement: (id: string, patch: Partial<SlideElement>, live?: boolean) => void
  updateSelected: (patch: Partial<SlideElement>, live?: boolean) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  copySelected: () => void
  pasteClipboard: () => void
  reorderSelected: (direction: 'front' | 'back' | 'forward' | 'backward') => void
  nudgeSelected: (dx: number, dy: number) => void

  // ---- デッキ設定
  setTitle: (title: string) => void
  setThemeId: (themeId: string) => void

  // ---- 参照ヘルパ
  currentSlide: () => Slide
  theme: () => Theme
  selectedElements: () => SlideElement[]
}

function cloneDeck(deck: Deck): Deck {
  return structuredClone(deck)
}

export const useDeckStore = create<DeckStore>((set, get) => {
  /** 共通の書き換え処理。history=true のときだけ past に積む。 */
  const apply = (recipe: (deck: Deck) => void, history: boolean): void => {
    set((state) => {
      const next = cloneDeck(state.deck)
      recipe(next)
      if (next.slides.length === 0) next.slides.push(createSlide())
      return {
        deck: next,
        dirty: true,
        slideIndex: clamp(state.slideIndex, 0, next.slides.length - 1),
        past: history ? [...state.past, state.deck].slice(-HISTORY_LIMIT) : state.past,
        future: history ? [] : state.future,
      }
    })
  }

  /** 現在のスライドを対象にした書き換え。 */
  const editSlide = (recipe: (slide: Slide) => void, history: boolean): void => {
    apply((deck) => {
      const slide = deck.slides[get().slideIndex]
      if (slide) recipe(slide)
    }, history)
  }

  return {
    deck: createStarterDeck(),
    filePath: null,
    dirty: false,
    autoSavePaused: false,
    slideIndex: 0,
    selectedIds: [],
    editingId: null,
    clipboard: [],
    past: [],
    future: [],
    inTransaction: false,
    lastLayoutId: DEFAULT_LAYOUT_ID,

    edit: (recipe) => apply(recipe, true),
    editLive: (recipe) => apply(recipe, false),

    pushHistory: () =>
      set((state) => ({
        past: [...state.past, state.deck].slice(-HISTORY_LIMIT),
        future: [],
        inTransaction: true,
      })),

    endTransaction: () => set({ inTransaction: false }),

    undo: () =>
      set((state) => {
        const previous = state.past.at(-1)
        if (!previous) return state
        return {
          deck: previous,
          past: state.past.slice(0, -1),
          future: [state.deck, ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
          slideIndex: clamp(state.slideIndex, 0, previous.slides.length - 1),
          selectedIds: [],
          editingId: null,
        }
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0]
        if (!next) return state
        return {
          deck: next,
          past: [...state.past, state.deck].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          dirty: true,
          slideIndex: clamp(state.slideIndex, 0, next.slides.length - 1),
          selectedIds: [],
          editingId: null,
        }
      }),

    loadDeck: (deck, filePath) =>
      set({
        deck,
        filePath,
        dirty: false,
        autoSavePaused: false,
        slideIndex: 0,
        selectedIds: [],
        editingId: null,
        past: [],
        future: [],
        inTransaction: false,
      }),

    resetDeck: () => get().loadDeck(createStarterDeck(), null),

    markSaved: (filePath) => set({ filePath, dirty: false, autoSavePaused: false }),
    setAutoSavePaused: (paused) => set({ autoSavePaused: paused }),

    selectSlide: (index) =>
      set((state) => ({
        slideIndex: clamp(index, 0, state.deck.slides.length - 1),
        selectedIds: [],
        editingId: null,
      })),

    select: (ids) => set({ selectedIds: ids, editingId: null }),

    toggleSelect: (id) =>
      set((state) => ({
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter((item) => item !== id)
          : [...state.selectedIds, id],
        editingId: null,
      })),

    clearSelection: () => set({ selectedIds: [], editingId: null }),
    setEditing: (id) => set({ editingId: id, selectedIds: id ? [id] : [] }),

    addSlide: (layoutId) => {
      const insertAt = get().slideIndex + 1
      apply((deck) => {
        deck.slides.splice(insertAt, 0, buildSlideFromLayout(layoutId))
      }, true)
      set({ slideIndex: insertAt, selectedIds: [], editingId: null, lastLayoutId: layoutId })
    },

    duplicateSlide: (index) => {
      const target = index ?? get().slideIndex
      apply((deck) => {
        const source = deck.slides[target]
        if (!source) return
        const copy = structuredClone(source)
        copy.id = newId('sl')
        for (const element of copy.elements) element.id = newId('el')
        deck.slides.splice(target + 1, 0, copy)
      }, true)
      set({ slideIndex: target + 1, selectedIds: [], editingId: null })
    },

    deleteSlide: (index) => {
      const target = index ?? get().slideIndex
      apply((deck) => {
        if (deck.slides.length <= 1) {
          deck.slides = [buildSlideFromLayout('blank')]
          return
        }
        deck.slides.splice(target, 1)
      }, true)
      set((state) => ({
        slideIndex: clamp(target, 0, state.deck.slides.length - 1),
        selectedIds: [],
        editingId: null,
      }))
    },

    moveSlide: (from, to) => {
      if (from === to) return
      apply((deck) => {
        const [moved] = deck.slides.splice(from, 1)
        if (moved) deck.slides.splice(to, 0, moved)
      }, true)
      set({ slideIndex: to, selectedIds: [], editingId: null })
    },

    setNotes: (notes) => editSlide((slide) => void (slide.notes = notes), true),

    setSlideBackground: (color) =>
      editSlide((slide) => {
        if (color) slide.background = { type: 'color', color }
        else delete slide.background
      }, true),

    addElement: (element) => {
      editSlide((slide) => {
        slide.elements.push(element)
      }, true)
      set({ selectedIds: [element.id], editingId: null })
    },

    updateElement: (id, patch, live = false) =>
      editSlide((slide) => {
        const index = slide.elements.findIndex((element) => element.id === id)
        if (index < 0) return
        slide.elements[index] = { ...slide.elements[index], ...patch } as SlideElement
      }, !live),

    updateSelected: (patch, live = false) => {
      const ids = get().selectedIds
      if (ids.length === 0) return
      editSlide((slide) => {
        slide.elements = slide.elements.map((element) =>
          ids.includes(element.id) ? ({ ...element, ...patch } as SlideElement) : element,
        )
      }, !live)
    },

    deleteSelected: () => {
      const ids = get().selectedIds
      if (ids.length === 0) return
      editSlide((slide) => {
        slide.elements = slide.elements.filter((element) => !ids.includes(element.id))
      }, true)
      set({ selectedIds: [], editingId: null })
    },

    duplicateSelected: () => {
      const ids = get().selectedIds
      if (ids.length === 0) return
      const copies: SlideElement[] = []
      editSlide((slide) => {
        for (const element of slide.elements) {
          if (!ids.includes(element.id)) continue
          const copy = structuredClone(element)
          copy.id = newId('el')
          copy.x = clamp(copy.x + PASTE_OFFSET, 0, SLIDE_WIDTH - 20)
          copy.y = clamp(copy.y + PASTE_OFFSET, 0, SLIDE_HEIGHT - 20)
          copies.push(copy)
        }
        slide.elements.push(...copies)
      }, true)
      set({ selectedIds: copies.map((element) => element.id), editingId: null })
    },

    copySelected: () => {
      const ids = get().selectedIds
      const slide = get().currentSlide()
      set({
        clipboard: slide.elements
          .filter((element) => ids.includes(element.id))
          .map((element) => structuredClone(element)),
      })
    },

    pasteClipboard: () => {
      const clipboard = get().clipboard
      if (clipboard.length === 0) return
      const copies = clipboard.map((element) => {
        const copy = structuredClone(element)
        copy.id = newId('el')
        copy.x = clamp(copy.x + PASTE_OFFSET, 0, SLIDE_WIDTH - 20)
        copy.y = clamp(copy.y + PASTE_OFFSET, 0, SLIDE_HEIGHT - 20)
        return copy
      })
      editSlide((slide) => {
        slide.elements.push(...copies)
      }, true)
      set({ selectedIds: copies.map((element) => element.id), editingId: null })
    },

    reorderSelected: (direction) => {
      const ids = get().selectedIds
      if (ids.length === 0) return
      editSlide((slide) => {
        const picked = slide.elements.filter((element) => ids.includes(element.id))
        const rest = slide.elements.filter((element) => !ids.includes(element.id))
        if (direction === 'front') {
          slide.elements = [...rest, ...picked]
          return
        }
        if (direction === 'back') {
          slide.elements = [...picked, ...rest]
          return
        }
        // 1 段だけ入れ替える
        const step = direction === 'forward' ? 1 : -1
        const order = [...slide.elements]
        const indices = order
          .map((element, index) => ({ element, index }))
          .filter(({ element }) => ids.includes(element.id))
          .map(({ index }) => index)
        const ordered = step > 0 ? indices.reverse() : indices
        for (const index of ordered) {
          const target = index + step
          if (target < 0 || target >= order.length) continue
          const tmp = order[index]
          order[index] = order[target]
          order[target] = tmp
        }
        slide.elements = order
      }, true)
    },

    nudgeSelected: (dx, dy) => {
      const ids = get().selectedIds
      if (ids.length === 0) return
      editSlide((slide) => {
        for (const element of slide.elements) {
          if (!ids.includes(element.id)) continue
          element.x = Math.round(element.x + dx)
          element.y = Math.round(element.y + dy)
        }
      }, true)
    },

    setTitle: (title) => apply((deck) => void (deck.title = title), true),
    setThemeId: (themeId) => apply((deck) => void (deck.themeId = themeId), true),

    currentSlide: () => {
      const state = get()
      return state.deck.slides[state.slideIndex] ?? state.deck.slides[0]
    },

    theme: () => {
      const state = get()
      return resolveTheme(state.deck.themeId, state.deck.theme)
    },

    selectedElements: () => {
      const state = get()
      const slide = state.deck.slides[state.slideIndex]
      if (!slide) return []
      return slide.elements.filter((element) => state.selectedIds.includes(element.id))
    },
  }
})
