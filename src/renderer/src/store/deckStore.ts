/**
 * デッキの状態管理。
 *
 * 履歴はスナップショット方式（deck 全体を structuredClone して積む）。
 * 要素数が数百程度ならコストは無視でき、パッチ方式より壊れにくい。
 * ドラッグ中の連続更新は pushHistory() + editLive() で 1 エントリにまとめる。
 */
import { create } from 'zustand'
import {
  activeSheetOf,
  activeSlides,
  clampSheetIndex,
  createSheet,
  createSlide,
  MAX_SHEET_NAME_LENGTH,
  nextSheetName,
  uniqueSheetName,
  type Deck,
  type Slide,
  type SlideElement,
  type TableElement,
  type Theme,
} from '@shared/deck'
import { clampPos, type CellPos } from '@shared/table'
import { buildSlideFromLayout, createStarterDeck, DEFAULT_LAYOUT_ID } from '@shared/layouts'
import { newId } from '@shared/id'
import { resolveTheme } from '@shared/themes'
import { clamp, SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'

const HISTORY_LIMIT = 50

/**
 * 表の中を操作しているときのセル選択（Excel の作業セルと範囲）。
 * active が作業セル、anchor が Shift で範囲を広げるときの起点。
 */
export interface TableCursor {
  elementId: string
  active: CellPos
  anchor: CellPos
  /** 増えるたびに、作業セルを編集状態にする（ダブルクリック・F2 の合図）。 */
  editRequest: number
}

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
  /** 表の中を操作しているときのセル選択。表の外ではいつも null。 */
  tableCursor: TableCursor | null
  clipboard: SlideElement[]
  past: Deck[]
  future: Deck[]
  /** ドラッグ中は true。この間 editLive() は履歴を積まない。 */
  inTransaction: boolean
  /** 最後に「新しいスライド」で使ったレイアウト。次回の既定にする。 */
  lastLayoutId: string
  /**
   * シートごとに最後に選んでいたスライド（シート ID → 番号）。Excel がシートごとに
   * 選択セルを覚えているのと同じで、シートを行き来しても元の位置に戻れるようにする。
   */
  slideIndexBySheet: Record<string, number>

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

  // ---- 表
  /** 表の中の操作を始める（表を選び、作業セルを置く）。edit なら最初から入力状態にする。 */
  enterTable: (id: string, pos?: CellPos, edit?: boolean) => void
  /** 作業セルを動かす。extend なら起点を残して範囲を広げる。 */
  setTableCursor: (active: CellPos, extend?: boolean) => void
  /** 起点と作業セルを直接指定する（範囲をまとめて選ぶとき）。 */
  setTableRange: (anchor: CellPos, active: CellPos) => void
  /** 作業セルを編集状態にする。 */
  requestCellEdit: () => void
  exitTable: () => void
  /** 表を書き換える（live でなければ履歴に積む）。 */
  editTable: (id: string, recipe: (table: TableElement) => void, live?: boolean) => void

  // ---- シート（Excel のシート見出しと同じ操作）
  /** シートを切り替える。内容の変更ではないので、未保存の印は付けない。 */
  selectSheet: (index: number) => void
  /** 開いているシートの右に新しいシートを足して開く。 */
  addSheet: () => void
  duplicateSheet: (index?: number) => void
  /** 最後の 1 枚は消せない。消せたら true。 */
  deleteSheet: (index?: number) => boolean
  /** 名前を変える。使えない名前ならその理由を返す（変えたら null）。 */
  renameSheet: (index: number, name: string) => string | null
  moveSheet: (from: number, to: number) => void
  setSheetColor: (index: number, color: string | null) => void

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

/** シートは 1 枚以上、各シートのスライドは 1 枚以上、という前提を保つ。 */
function ensureDeckShape(deck: Deck): void {
  if (deck.sheets.length === 0) deck.sheets.push(createSheet('シート1'))
  for (const sheet of deck.sheets) {
    if (sheet.slides.length === 0) sheet.slides.push(createSlide())
  }
  deck.activeSheet = clampSheetIndex(deck, deck.activeSheet)
}

/** いま開いているシートで選んでいたスライドを覚えた、新しい対応表を返す。 */
function rememberSlideIndex(state: DeckStore): Record<string, number> {
  return { ...state.slideIndexBySheet, [activeSheetOf(state.deck).id]: state.slideIndex }
}

/**
 * 表のセル選択を、書き換え後のデッキに合わせる。表が無くなっていれば外し、
 * 行・列が減っていればはみ出さない位置に寄せる。
 */
function validCursor(deck: Deck, slideIndex: number, cursor: TableCursor | null): TableCursor | null {
  if (!cursor) return null
  const table = findTable(deck, slideIndex, cursor.elementId)
  if (!table) return null
  return { ...cursor, active: clampPos(table, cursor.active), anchor: clampPos(table, cursor.anchor) }
}

function findTable(deck: Deck, slideIndex: number, id: string): TableElement | undefined {
  return activeSlides(deck)[slideIndex]?.elements.find(
    (element): element is TableElement => element.id === id && element.type === 'table',
  )
}

/** スライドとその中の要素に新しい ID を振る（複製したときに ID が重ならないように）。 */
function renewSlideIds(slide: Slide): void {
  slide.id = newId('sl')
  for (const element of slide.elements) element.id = newId('el')
}

export const useDeckStore = create<DeckStore>((set, get) => {
  /** 共通の書き換え処理。history=true のときだけ past に積む。 */
  const apply = (recipe: (deck: Deck) => void, history: boolean): void => {
    set((state) => {
      const next = cloneDeck(state.deck)
      recipe(next)
      ensureDeckShape(next)
      const slideIndex = clamp(state.slideIndex, 0, activeSlides(next).length - 1)
      return {
        deck: next,
        dirty: true,
        slideIndex,
        tableCursor: validCursor(next, slideIndex, state.tableCursor),
        past: history ? [...state.past, state.deck].slice(-HISTORY_LIMIT) : state.past,
        future: history ? [] : state.future,
      }
    })
  }

  /** 現在のスライドを対象にした書き換え。 */
  const editSlide = (recipe: (slide: Slide) => void, history: boolean): void => {
    apply((deck) => {
      const slide = activeSlides(deck)[get().slideIndex]
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
    tableCursor: null,
    clipboard: [],
    past: [],
    future: [],
    inTransaction: false,
    lastLayoutId: DEFAULT_LAYOUT_ID,
    slideIndexBySheet: {},

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
        const slideIndex = clamp(state.slideIndex, 0, activeSlides(previous).length - 1)
        // 表の中で元に戻したときは、表から出ずに続けて操作できるようにする
        const tableCursor = validCursor(previous, slideIndex, state.tableCursor)
        return {
          deck: previous,
          past: state.past.slice(0, -1),
          future: [state.deck, ...state.future].slice(0, HISTORY_LIMIT),
          dirty: true,
          slideIndex,
          selectedIds: tableCursor ? [tableCursor.elementId] : [],
          editingId: null,
          tableCursor,
        }
      }),

    redo: () =>
      set((state) => {
        const next = state.future[0]
        if (!next) return state
        const slideIndex = clamp(state.slideIndex, 0, activeSlides(next).length - 1)
        const tableCursor = validCursor(next, slideIndex, state.tableCursor)
        return {
          deck: next,
          past: [...state.past, state.deck].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
          dirty: true,
          slideIndex,
          selectedIds: tableCursor ? [tableCursor.elementId] : [],
          editingId: null,
          tableCursor,
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
        slideIndexBySheet: {},
        tableCursor: null,
      }),

    resetDeck: () => get().loadDeck(createStarterDeck(), null),

    markSaved: (filePath) => set({ filePath, dirty: false, autoSavePaused: false }),
    setAutoSavePaused: (paused) => set({ autoSavePaused: paused }),

    selectSlide: (index) =>
      set((state) => ({
        slideIndex: clamp(index, 0, activeSlides(state.deck).length - 1),
        selectedIds: [],
        editingId: null,
        tableCursor: null,
      })),

    select: (ids) =>
      set((state) => ({
        selectedIds: ids,
        editingId: null,
        // 表の中の操作は、その表だけを選んでいる間だけ続ける
        tableCursor:
          state.tableCursor && ids.length === 1 && ids[0] === state.tableCursor.elementId
            ? state.tableCursor
            : null,
      })),

    toggleSelect: (id) =>
      set((state) => ({
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter((item) => item !== id)
          : [...state.selectedIds, id],
        editingId: null,
        tableCursor: null,
      })),

    clearSelection: () => set({ selectedIds: [], editingId: null, tableCursor: null }),
    setEditing: (id) => set({ editingId: id, selectedIds: id ? [id] : [], tableCursor: null }),

    enterTable: (id, pos = { row: 0, col: 0 }, edit = false) =>
      set((state) => {
        const table = findTable(state.deck, state.slideIndex, id)
        if (!table) return state
        const active = clampPos(table, pos)
        return {
          selectedIds: [id],
          editingId: null,
          tableCursor: {
            elementId: id,
            active,
            anchor: active,
            editRequest: edit ? (state.tableCursor?.editRequest ?? 0) + 1 : 0,
          },
        }
      }),

    setTableCursor: (active, extend = false) =>
      set((state) => {
        const cursor = state.tableCursor
        if (!cursor) return state
        const table = findTable(state.deck, state.slideIndex, cursor.elementId)
        if (!table) return { tableCursor: null }
        const next = clampPos(table, active)
        return { tableCursor: { ...cursor, active: next, anchor: extend ? cursor.anchor : next } }
      }),

    setTableRange: (anchor, active) =>
      set((state) => {
        const cursor = state.tableCursor
        if (!cursor) return state
        const table = findTable(state.deck, state.slideIndex, cursor.elementId)
        if (!table) return { tableCursor: null }
        return {
          tableCursor: { ...cursor, anchor: clampPos(table, anchor), active: clampPos(table, active) },
        }
      }),

    requestCellEdit: () =>
      set((state) =>
        state.tableCursor
          ? { tableCursor: { ...state.tableCursor, editRequest: state.tableCursor.editRequest + 1 } }
          : state,
      ),

    exitTable: () => set({ tableCursor: null }),

    editTable: (id, recipe, live = false) =>
      apply((deck) => {
        const table = findTable(deck, get().slideIndex, id)
        if (table) recipe(table)
      }, !live),

    selectSheet: (index) =>
      set((state) => {
        const target = clampSheetIndex(state.deck, index)
        if (target === state.deck.activeSheet) return state
        const memory = rememberSlideIndex(state)
        const sheet = state.deck.sheets[target]
        return {
          // 中身は変えないので複製せず、開くシートの番号だけ差し替える
          deck: { ...state.deck, activeSheet: target },
          slideIndexBySheet: memory,
          slideIndex: clamp(memory[sheet.id] ?? 0, 0, sheet.slides.length - 1),
          selectedIds: [],
          editingId: null,
          tableCursor: null,
        }
      }),

    addSheet: () => {
      const memory = rememberSlideIndex(get())
      apply((deck) => {
        const insertAt = deck.activeSheet + 1
        const sheet = createSheet(nextSheetName(deck.sheets), [buildSlideFromLayout('title')])
        deck.sheets.splice(insertAt, 0, sheet)
        deck.activeSheet = insertAt
      }, true)
      set({ slideIndexBySheet: memory, slideIndex: 0, selectedIds: [], editingId: null })
    },

    duplicateSheet: (index) => {
      const memory = rememberSlideIndex(get())
      const target = index ?? get().deck.activeSheet
      apply((deck) => {
        const source = deck.sheets[target]
        if (!source) return
        const copy = structuredClone(source)
        copy.id = newId('sh')
        copy.name = uniqueSheetName(source.name, deck.sheets)
        copy.slides.forEach(renewSlideIds)
        deck.sheets.splice(target + 1, 0, copy)
        deck.activeSheet = target + 1
      }, true)
      set({ slideIndexBySheet: memory, slideIndex: 0, selectedIds: [], editingId: null })
    },

    deleteSheet: (index) => {
      const state = get()
      if (state.deck.sheets.length <= 1) return false
      const target = index ?? state.deck.activeSheet
      const removedId = state.deck.sheets[target]?.id
      if (!removedId) return false
      apply((deck) => {
        deck.sheets.splice(target, 1)
        // Excel と同じく、消したシートの右隣（右端なら左隣）を開く
        if (deck.activeSheet > target || deck.activeSheet >= deck.sheets.length) {
          deck.activeSheet = Math.max(0, deck.activeSheet - 1)
        }
      }, true)
      set((current) => {
        const memory = { ...current.slideIndexBySheet }
        delete memory[removedId]
        const sheet = activeSheetOf(current.deck)
        return {
          slideIndexBySheet: memory,
          slideIndex: clamp(memory[sheet.id] ?? 0, 0, sheet.slides.length - 1),
          selectedIds: [],
          editingId: null,
        }
      })
      return true
    },

    renameSheet: (index, name) => {
      const trimmed = name.trim()
      if (!trimmed) return 'シート名を入力してください。'
      if (trimmed.length > MAX_SHEET_NAME_LENGTH) {
        return `シート名は ${MAX_SHEET_NAME_LENGTH} 文字以内にしてください。`
      }
      const sheets = get().deck.sheets
      const sheet = sheets[index]
      if (!sheet) return null
      if (sheet.name === trimmed) return null
      const taken = sheets.some(
        (other, otherIndex) =>
          otherIndex !== index && other.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (taken) return `「${trimmed}」という名前のシートはすでにあります。`
      apply((deck) => {
        const target = deck.sheets[index]
        if (target) target.name = trimmed
      }, true)
      return null
    },

    moveSheet: (from, to) => {
      if (from === to) return
      apply((deck) => {
        const activeId = activeSheetOf(deck).id
        const [moved] = deck.sheets.splice(from, 1)
        if (!moved) return
        deck.sheets.splice(to, 0, moved)
        deck.activeSheet = deck.sheets.findIndex((sheet) => sheet.id === activeId)
      }, true)
    },

    setSheetColor: (index, color) =>
      apply((deck) => {
        const sheet = deck.sheets[index]
        if (!sheet) return
        if (color) sheet.color = color
        else delete sheet.color
      }, true),

    addSlide: (layoutId) => {
      const insertAt = get().slideIndex + 1
      apply((deck) => {
        activeSlides(deck).splice(insertAt, 0, buildSlideFromLayout(layoutId))
      }, true)
      set({ slideIndex: insertAt, selectedIds: [], editingId: null, lastLayoutId: layoutId })
    },

    duplicateSlide: (index) => {
      const target = index ?? get().slideIndex
      apply((deck) => {
        const slides = activeSlides(deck)
        const source = slides[target]
        if (!source) return
        const copy = structuredClone(source)
        renewSlideIds(copy)
        slides.splice(target + 1, 0, copy)
      }, true)
      set({ slideIndex: target + 1, selectedIds: [], editingId: null })
    },

    deleteSlide: (index) => {
      const target = index ?? get().slideIndex
      apply((deck) => {
        const sheet = activeSheetOf(deck)
        if (sheet.slides.length <= 1) {
          sheet.slides = [buildSlideFromLayout('blank')]
          return
        }
        sheet.slides.splice(target, 1)
      }, true)
      set((state) => ({
        slideIndex: clamp(target, 0, activeSlides(state.deck).length - 1),
        selectedIds: [],
        editingId: null,
      }))
    },

    moveSlide: (from, to) => {
      if (from === to) return
      apply((deck) => {
        const slides = activeSlides(deck)
        const [moved] = slides.splice(from, 1)
        if (moved) slides.splice(to, 0, moved)
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
      const slides = activeSlides(state.deck)
      return slides[state.slideIndex] ?? slides[0]
    },

    theme: () => {
      const state = get()
      return resolveTheme(state.deck.themeId, state.deck.theme)
    },

    selectedElements: () => {
      const state = get()
      const slide = activeSlides(state.deck)[state.slideIndex]
      if (!slide) return []
      return slide.elements.filter((element) => state.selectedIds.includes(element.id))
    },
  }
})
