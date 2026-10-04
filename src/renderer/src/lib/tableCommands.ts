/**
 * 表の操作。リボンの「表」タブ・セルの右クリックメニュー・キーボードから同じ関数を呼ぶ。
 *
 * 対象は「表の中にいればその表と選択範囲、表だけを 1 つ選んでいれば表全体」。
 * 行・列の操作は Excel と同じく、選んでいる行（列）の数だけ挿入・削除する。
 */
import {
  activeSlides,
  createTableElement,
  type TableCell,
  type TableElement,
  type TextAlign,
} from '@shared/deck'
import { centerPosition } from '@shared/layouts'
import {
  cellStyle,
  clearCells,
  deleteCols,
  deleteRows,
  fullRange,
  insertCols,
  insertRows,
  pasteGrid,
  patchCells,
  rangeOf,
  rangeToHtml,
  rangeToTsv,
  setCellText,
  tableColors,
  tableFromGrid,
  type CellPatch,
  type CellRange,
} from '@shared/table'
import { resolveTheme } from '@shared/themes'
import { useDeckStore, type DeckStore } from '../store/deckStore'
import { flashStatus, useUiStore } from '../store/uiStore'

export interface TableTarget {
  table: TableElement
  /** 表の中で選んでいる範囲。表全体を選んでいるだけなら null。 */
  range: CellRange | null
}

/** いま操作の対象になっている表の要素（無ければ null）。React の selector からも使う。 */
export function selectTargetTable(state: DeckStore): TableElement | null {
  const slide = activeSlides(state.deck)[state.slideIndex]
  if (!slide) return null
  const id = state.tableCursor?.elementId ?? (state.selectedIds.length === 1 ? state.selectedIds[0] : null)
  if (!id) return null
  const element = slide.elements.find((item) => item.id === id)
  return element?.type === 'table' ? element : null
}

export function currentTable(state: DeckStore = useDeckStore.getState()): TableTarget | null {
  const table = selectTargetTable(state)
  if (!table) return null
  const cursor = state.tableCursor
  const range = cursor && cursor.elementId === table.id ? rangeOf(cursor.active, cursor.anchor) : null
  return { table, range }
}

function edit(target: TableTarget, recipe: (table: TableElement) => void): void {
  useDeckStore.getState().editTable(target.table.id, recipe)
}

// ---------------------------------------------------------------- 挿入

/** 行数×列数の空の表をスライドの中央に置き、すぐ入力できるよう左上のセルを選ぶ。 */
export function insertTable(rows: number, cols: number): void {
  const store = useDeckStore.getState()
  const table = createTableElement(rows, cols)
  Object.assign(table, centerPosition(table.w, table.h))
  store.addElement(table)
  store.enterTable(table.id, { row: 0, col: 0 })
  useUiStore.getState().setRibbonTab('table')
  flashStatus(`${rows} 行 × ${cols} 列の表を挿入しました（そのまま入力できます）`)
}

// ---------------------------------------------------------------- 行と列

export function insertTableRows(where: 'above' | 'below'): void {
  const target = currentTable()
  if (!target) return
  const range = target.range ?? fullRange(target.table)
  const count = target.range ? range.bottom - range.top + 1 : 1
  const at = where === 'above' ? range.top : range.bottom + 1
  edit(target, (table) => insertRows(table, at, count))
  // 選んでいた列のまま、増えた行に移る（1 セル選んでいたなら、すぐ下の新しいセル）
  selectInserted(target, { top: at, bottom: at + count - 1 }, target.range && { left: range.left, right: range.right })
}

export function insertTableCols(where: 'left' | 'right'): void {
  const target = currentTable()
  if (!target) return
  const range = target.range ?? fullRange(target.table)
  const count = target.range ? range.right - range.left + 1 : 1
  const at = where === 'left' ? range.left : range.right + 1
  edit(target, (table) => insertCols(table, at, count))
  selectInserted(target, target.range && { top: range.top, bottom: range.bottom }, { left: at, right: at + count - 1 })
}

/** 挿入した行（列）を選んだ状態にする（何が増えたか分かるように）。指定の無い向きは表全体。 */
function selectInserted(
  target: TableTarget,
  rows: { top: number; bottom: number } | null,
  cols: { left: number; right: number } | null,
): void {
  const store = useDeckStore.getState()
  if (!store.tableCursor || store.tableCursor.elementId !== target.table.id) return
  const updated = currentTable()
  if (!updated) return
  const all = fullRange(updated.table)
  const top = rows?.top ?? all.top
  const bottom = rows?.bottom ?? all.bottom
  const left = cols?.left ?? all.left
  const right = cols?.right ?? all.right
  store.setTableRange({ row: bottom, col: right }, { row: top, col: left })
}

export function deleteTableRows(): void {
  const target = currentTable()
  if (!target?.range) return
  if (target.table.rows.length <= 1) {
    flashStatus('表の最後の 1 行は削除できません（表ごと消すときは表を選んで Delete）')
    return
  }
  const { top, bottom } = target.range
  edit(target, (table) => deleteRows(table, top, bottom))
  const store = useDeckStore.getState()
  store.setTableCursor({ row: top, col: target.range.left })
}

export function deleteTableCols(): void {
  const target = currentTable()
  if (!target?.range) return
  if ((target.table.rows[0]?.length ?? 0) <= 1) {
    flashStatus('表の最後の 1 列は削除できません（表ごと消すときは表を選んで Delete）')
    return
  }
  const { left, right } = target.range
  edit(target, (table) => deleteCols(table, left, right))
  const store = useDeckStore.getState()
  store.setTableCursor({ row: target.range.top, col: left })
}

// ---------------------------------------------------------------- セルの中身と書式

/** 選択範囲（表全体を選んでいれば全セル）の文字を消す。書式は残す。 */
export function clearTableCells(): void {
  const target = currentTable()
  if (!target) return
  const range = target.range ?? fullRange(target.table)
  edit(target, (table) => clearCells(table, range))
}

export function formatTableCells(patch: { [K in keyof CellPatch]?: CellPatch[K] | null }): void {
  const target = currentTable()
  if (!target) return
  const range = target.range ?? fullRange(target.table)
  edit(target, (table) => patchCells(table, range, patch))
}

/** 作業セルの見た目を基準に、太字を付ける／外す（Excel の Ctrl+B と同じ）。 */
export function toggleTableBold(): void {
  const target = currentTable()
  if (!target) return
  const store = useDeckStore.getState()
  const theme = resolveTheme(store.deck.themeId, store.deck.theme)
  const range = target.range ?? fullRange(target.table)
  const lead = cellStyle(target.table, range.top, range.left, tableColors(target.table, theme))
  formatTableCells({ bold: !lead.bold })
}

export function alignTableCells(align: TextAlign): void {
  formatTableCells({ align })
}

/** 範囲の先頭セルの書式（リボンのボタンの押下状態に使う）。 */
export function leadCell(target: TableTarget): TableCell | undefined {
  const range = target.range ?? fullRange(target.table)
  return target.table.rows[range.top]?.[range.left]
}

// ---------------------------------------------------------------- 表のスタイル

export type TableOption = 'headerRow' | 'bandedRows' | 'firstColumn'

export function setTableOption(option: TableOption, value: boolean): void {
  const target = currentTable()
  if (!target) return
  edit(target, (table) => {
    table[option] = value
  })
}

export function setTableStyle(patch: Partial<Pick<TableElement, 'fontSize' | 'borderColor' | 'headerFill'>>): void {
  const target = currentTable()
  if (!target) return
  edit(target, (table) => Object.assign(table, patch))
}

// ---------------------------------------------------------------- クリップボード（Excel とタブ区切りでやりとり）

/** 選んでいる範囲（表だけを選んでいれば表全体）を、Excel に貼れる形にする。 */
export function tableSelectionToClipboard(): { text: string; html: string } | null {
  const target = currentTable()
  if (!target) return null
  const range = target.range ?? fullRange(target.table)
  return { text: rangeToTsv(target.table, range), html: rangeToHtml(target.table, range) }
}

/**
 * 表の中の作業セルを左上にして、文字の格子を貼り付ける（足りない行・列は増やす）。
 * 1 つの値を範囲に貼ったときは、範囲のすべてのセルに入れる（Excel と同じ）。
 * 表の中にいなければ false。
 */
export function pasteGridIntoTable(grid: string[][]): boolean {
  const target = currentTable()
  if (!target?.range || grid.length === 0) return false
  const range = target.range
  const multiCell = range.top !== range.bottom || range.left !== range.right
  if (grid.length === 1 && grid[0].length === 1 && multiCell) {
    edit(target, (table) => {
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let col = range.left; col <= range.right; col += 1) setCellText(table, { row, col }, grid[0][0])
      }
    })
    return true
  }
  let pasted: CellRange | null = null
  edit(target, (table) => {
    pasted = pasteGrid(table, { row: range.top, col: range.left }, grid)
  })
  const done = pasted as CellRange | null
  if (done) {
    useDeckStore.getState().setTableRange({ row: done.top, col: done.left }, { row: done.bottom, col: done.right })
  }
  return true
}

/** Excel などからコピーした格子を、新しい表としてスライドに置く。 */
export function insertTableFromGrid(grid: string[][]): void {
  const store = useDeckStore.getState()
  const table = tableFromGrid(grid)
  store.addElement(table)
  useUiStore.getState().setRibbonTab('table')
  flashStatus(`表を貼り付けました（${table.rows.length} 行 × ${table.rows[0]?.length ?? 0} 列）`)
}
