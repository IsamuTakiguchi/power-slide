/**
 * 表（TableElement）の操作と見た目の決まりごと。
 *
 * 編集画面・リボン・貼り付け・pptx 書き出しが同じ関数を使うことで、
 * 画面と書き出しの色や、行列操作の結果がずれないようにしている。
 * ここの関数は DOM に依存しないので main（Node）からも使える。
 */
import { createTableElement, type TableCell, type TableElement, type Theme } from './deck'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './geometry'

/** セルの位置（0 始まり）。 */
export interface CellPos {
  row: number
  col: number
}

/** セルの範囲（両端を含む）。 */
export interface CellRange {
  top: number
  left: number
  bottom: number
  right: number
}

export function rowCount(table: TableElement): number {
  return table.rows.length
}

export function colCount(table: TableElement): number {
  return table.rows[0]?.length ?? 0
}

/** 2 つのセル（作業セルと起点）から範囲をつくる。 */
export function rangeOf(a: CellPos, b: CellPos): CellRange {
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  }
}

/** 表全体の範囲。 */
export function fullRange(table: TableElement): CellRange {
  return { top: 0, left: 0, bottom: rowCount(table) - 1, right: colCount(table) - 1 }
}

export function clampPos(table: TableElement, pos: CellPos): CellPos {
  // 数でない位置（座標の取れないイベントなど）は左上として扱い、選択が壊れないようにする
  const row = Number.isFinite(pos.row) ? Math.trunc(pos.row) : 0
  const col = Number.isFinite(pos.col) ? Math.trunc(pos.col) : 0
  return {
    row: Math.min(Math.max(0, row), rowCount(table) - 1),
    col: Math.min(Math.max(0, col), colCount(table) - 1),
  }
}

function forEachCell(
  table: TableElement,
  range: CellRange,
  visit: (cell: TableCell, row: number, col: number) => void,
): void {
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let col = range.left; col <= range.right; col += 1) {
      const cell = table.rows[row]?.[col]
      if (cell) visit(cell, row, col)
    }
  }
}

// ---------------------------------------------------------------- 見た目

/** 2 色を混ぜる（amount=0 で base、1 で target）。#rrggbb 以外は base をそのまま返す。 */
export function mixHex(base: string, target: string, amount: number): string {
  const parse = (value: string) => {
    const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
    if (!match) return null
    const n = parseInt(match[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const from = parse(base)
  const to = parse(target)
  if (!from || !to) return base
  const mixed = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** テーマの背景が暗いか（縞模様や罫線の色の向きを変えるため）。 */
function isDark(color: string): boolean {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return false
  const n = parseInt(match[1], 16)
  const luminance = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luminance < 128
}

export interface TableColors {
  border: string
  /** 本文のセルの塗り（PowerPoint の表と同じく不透明にして、後ろの文字を透かさない）。 */
  body: string
  headerFill: string
  headerText: string
  /** 縞模様の塗り。 */
  band: string
  text: string
}

export function tableColors(table: TableElement, theme: Theme): TableColors {
  const dark = isDark(theme.background)
  return {
    border: table.borderColor || mixHex(theme.bodyColor, theme.background, dark ? 0.6 : 0.75),
    body: theme.background,
    headerFill: table.headerFill || theme.accent,
    headerText: '#ffffff',
    band: mixHex(table.headerFill || theme.accent, theme.background, dark ? 0.8 : 0.88),
    text: theme.bodyColor,
  }
}

/** 1 セルの最終的な見た目（セルの書式 → 表のスタイル → テーマ の順に決まる）。 */
export interface ResolvedCellStyle {
  fill: string
  color: string
  bold: boolean
  align: 'left' | 'center' | 'right'
}

export function cellStyle(
  table: TableElement,
  row: number,
  col: number,
  colors: TableColors,
): ResolvedCellStyle {
  const cell = table.rows[row]?.[col] ?? { text: '' }
  const isHeader = table.headerRow && row === 0
  // 縞模様は見出しを除いた本文の 2 行目、4 行目…を塗る（PowerPoint の既定と同じ）
  const bodyIndex = table.headerRow ? row - 1 : row
  const banded = table.bandedRows && !isHeader && bodyIndex % 2 === 1
  return {
    fill: cell.fill || (isHeader ? colors.headerFill : banded ? colors.band : colors.body),
    color: cell.color || (isHeader ? colors.headerText : colors.text),
    bold: cell.bold ?? (isHeader || (table.firstColumn && col === 0)),
    align: cell.align ?? 'left',
  }
}

/** 各列の幅（論理 px）。 */
export function columnWidthsPx(table: TableElement): number[] {
  const total = table.colWidths.reduce((sum, width) => sum + width, 0) || 1
  return table.colWidths.map((width) => (table.w * width) / total)
}

// ---------------------------------------------------------------- 行と列

function emptyRow(cols: number): TableCell[] {
  return Array.from({ length: cols }, () => ({ text: '' }))
}

/**
 * at の位置に行を差し込む。既存の行の高さを保つため、表の高さを伸ばす
 * （スライドの下端を越える分は伸ばさず、行を詰める）。
 */
export function insertRows(table: TableElement, at: number, count = 1): void {
  const rowHeight = table.h / rowCount(table)
  const cols = colCount(table)
  const index = Math.min(Math.max(0, at), rowCount(table))
  table.rows.splice(index, 0, ...Array.from({ length: count }, () => emptyRow(cols)))
  table.h = Math.round(Math.min(table.h + rowHeight * count, SLIDE_HEIGHT - table.y))
}

/** from〜to の行を消す。全行は消さない（最低 1 行残す）。 */
export function deleteRows(table: TableElement, from: number, to: number): void {
  const total = rowCount(table)
  const top = Math.max(0, Math.min(from, to))
  const bottom = Math.min(total - 1, Math.max(from, to))
  const removing = Math.min(bottom - top + 1, total - 1)
  if (removing <= 0) return
  const rowHeight = table.h / total
  table.rows.splice(top, removing)
  table.h = Math.max(16, Math.round(table.h - rowHeight * removing))
}

/** at の位置に列を差し込む。新しい列は既存の列の平均の幅にする。 */
export function insertCols(table: TableElement, at: number, count = 1): void {
  const cols = colCount(table)
  const index = Math.min(Math.max(0, at), cols)
  const average = table.colWidths.reduce((sum, width) => sum + width, 0) / cols
  const columnPx = table.w / cols
  for (const row of table.rows) {
    row.splice(index, 0, ...Array.from({ length: count }, () => ({ text: '' })))
  }
  table.colWidths.splice(index, 0, ...Array.from({ length: count }, () => average))
  table.w = Math.round(Math.min(table.w + columnPx * count, SLIDE_WIDTH - table.x))
}

/** from〜to の列を消す。全列は消さない（最低 1 列残す）。 */
export function deleteCols(table: TableElement, from: number, to: number): void {
  const total = colCount(table)
  const left = Math.max(0, Math.min(from, to))
  const right = Math.min(total - 1, Math.max(from, to))
  const removing = Math.min(right - left + 1, total - 1)
  if (removing <= 0) return
  const widths = columnWidthsPx(table)
  const removedPx = widths.slice(left, left + removing).reduce((sum, width) => sum + width, 0)
  for (const row of table.rows) row.splice(left, removing)
  table.colWidths.splice(left, removing)
  table.w = Math.max(16, Math.round(table.w - removedPx))
}

// ---------------------------------------------------------------- セルの中身と書式

export function setCellText(table: TableElement, pos: CellPos, text: string): void {
  const cell = table.rows[pos.row]?.[pos.col]
  if (cell) cell.text = text
}

/** 範囲の文字を消す（書式は残す。Excel の Delete と同じ）。 */
export function clearCells(table: TableElement, range: CellRange): void {
  forEachCell(table, range, (cell) => {
    cell.text = ''
  })
}

export type CellPatch = Partial<Omit<TableCell, 'text'>>

/** 範囲に書式を当てる。値に null を渡すとその書式を外す。 */
export function patchCells(
  table: TableElement,
  range: CellRange,
  patch: { [K in keyof CellPatch]?: CellPatch[K] | null },
): void {
  forEachCell(table, range, (cell) => {
    for (const [key, value] of Object.entries(patch) as [keyof CellPatch, unknown][]) {
      if (value === null || value === undefined || value === '') delete cell[key]
      else (cell as unknown as Record<string, unknown>)[key] = value
    }
  })
}

/**
 * at を左上にして文字の格子を貼り付ける。足りない行・列は増やす（Excel で表の外まで
 * 貼ったときに広がるのと同じ）。貼り付けた範囲を返す。
 */
export function pasteGrid(table: TableElement, at: CellPos, grid: string[][]): CellRange {
  const height = grid.length
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (height === 0 || width === 0) return rangeOf(at, at)
  const needRows = at.row + height - rowCount(table)
  if (needRows > 0) insertRows(table, rowCount(table), needRows)
  const needCols = at.col + width - colCount(table)
  if (needCols > 0) insertCols(table, colCount(table), needCols)
  grid.forEach((values, r) => {
    values.forEach((text, c) => {
      const cell = table.rows[at.row + r]?.[at.col + c]
      if (!cell) return
      cell.text = text
      // Excel と同じく、数値は右に寄せる（書式を明示していないセルだけ）
      if (cell.align === undefined && looksNumeric(text)) cell.align = 'right'
    })
  })
  return { top: at.row, left: at.col, bottom: at.row + height - 1, right: at.col + width - 1 }
}

/** 数値（金額・割合・桁区切りを含む）に見えるか。 */
export function looksNumeric(text: string): boolean {
  const value = text.trim()
  if (!value) return false
  return /^[-+(]?[¥$€£]?\s*\d{1,3}(,\d{3})*(\.\d+)?\)?%?$|^[-+]?[¥$€£]?\d+(\.\d+)?%?$/.test(value)
}

// ---------------------------------------------------------------- Excel とのやりとり（タブ区切り）

/**
 * Excel がクリップボードに入れるタブ区切りテキストを格子にする。
 * セル内に改行・タブ・" を含むと "…" で囲まれ、" は "" になるので、それも戻す。
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let atCellStart = true
  const source = text.replace(/\r\n?/g, '\n')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && atCellStart) {
      quoted = true
      atCellStart = false
      continue
    }
    if (char === '\t') {
      row.push(cell)
      cell = ''
      atCellStart = true
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      atCellStart = true
      continue
    }
    cell += char
    atCellStart = false
  }
  // 末尾の改行（Excel は最後の行にも付ける）で空行を作らない
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  // 行ごとの列数をそろえる
  const width = Math.max(0, ...rows.map((values) => values.length))
  return rows.map((values) => [...values, ...Array.from({ length: width - values.length }, () => '')])
}

/** 格子として扱うべきテキストか（タブを含む＝Excel などの表からのコピー）。 */
export function isGridText(text: string): boolean {
  return text.includes('\t')
}

function quoteTsvCell(text: string): string {
  return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 範囲を Excel に貼り付けられるタブ区切りテキストにする。 */
export function rangeToTsv(table: TableElement, range: CellRange): string {
  const lines: string[] = []
  for (let row = range.top; row <= range.bottom; row += 1) {
    const values: string[] = []
    for (let col = range.left; col <= range.right; col += 1) {
      values.push(quoteTsvCell(table.rows[row]?.[col]?.text ?? ''))
    }
    lines.push(values.join('\t'))
  }
  return `${lines.join('\r\n')}\r\n`
}

/** 範囲を HTML の表にする（Word・PowerPoint などに書式付きで貼れるように）。 */
export function rangeToHtml(table: TableElement, range: CellRange): string {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  const body: string[] = []
  for (let row = range.top; row <= range.bottom; row += 1) {
    const cells: string[] = []
    for (let col = range.left; col <= range.right; col += 1) {
      const cell = table.rows[row]?.[col]
      const text = escape(cell?.text ?? '')
      cells.push(`<td>${cell?.bold ? `<b>${text}</b>` : text}</td>`)
    }
    body.push(`<tr>${cells.join('')}</tr>`)
  }
  return `<table>${body.join('')}</table>`
}

/**
 * 文字の格子から新しい表をつくる。スライドに収まる大きさにして中央に置く。
 * 1 行目は見出しとして扱い、数値のセルは右に寄せる。
 */
export function tableFromGrid(grid: string[][]): TableElement {
  const rows = Math.max(1, grid.length)
  const cols = Math.max(1, ...grid.map((values) => values.length))
  // 行が多いときは行を詰め、文字も小さくして収める
  const fontSize = rows > 10 ? Math.max(12, Math.floor(Math.max(28, 600 / rows) * 0.45)) : 22
  // セルの中に改行があれば、いちばん行数の多いセルが収まる高さにする（Excel の行の高さの自動調整と同じ）
  const maxLines = Math.max(1, ...grid.flat().map((text) => text.split('\n').length))
  const fitHeight = Math.ceil(maxLines * fontSize * 1.3 + 14)
  const rowHeight = Math.max(rows > 10 ? Math.max(28, Math.floor(600 / rows)) : 48, fitHeight)
  const w = Math.min(1160, Math.max(360, cols * 180))
  const h = Math.min(640, rows * rowHeight)
  const table = createTableElement(rows, cols, {
    w,
    h,
    x: Math.round((SLIDE_WIDTH - w) / 2),
    y: Math.round((SLIDE_HEIGHT - h) / 2),
    fontSize,
  })
  pasteGrid(table, { row: 0, col: 0 }, grid)
  table.colWidths = fitColumnWidths(grid, cols)
  return table
}

/** 文字の見た目の幅（全角＝2、半角＝1）。 */
function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    // ASCII・ラテン文字と半角カナは 1、それ以外（漢字・かな・全角記号）は 2
    width += code <= 0xff || (code >= 0xff61 && code <= 0xff9f) ? 1 : 2
  }
  return width
}

/**
 * 列ごとに、いちばん長い中身に合わせた幅の比率を出す（Excel の列幅の自動調整に近い）。
 * 極端に偏らないよう、狭い列にも最低限の幅を残し、広すぎる列は抑える。
 */
function fitColumnWidths(grid: string[][], cols: number): number[] {
  return Array.from({ length: cols }, (_, col) => {
    const longest = Math.max(
      0,
      ...grid.map((row) => Math.max(0, ...(row[col] ?? '').split('\n').map(displayWidth))),
    )
    return Math.min(40, Math.max(6, longest + 2))
  })
}

// ---------------------------------------------------------------- 位置

/** 表の左上からの位置（論理 px）にあるセル。表の外なら端のセルに寄せる。 */
export function cellAt(table: TableElement, x: number, y: number): CellPos {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { row: 0, col: 0 }
  const rows = rowCount(table)
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / table.h) * rows)))
  const widths = columnWidthsPx(table)
  let col = widths.length - 1
  let edge = 0
  for (let index = 0; index < widths.length; index += 1) {
    edge += widths[index]
    if (x < edge) {
      col = index
      break
    }
  }
  return { row, col: Math.max(0, col) }
}

// ---------------------------------------------------------------- 集計（Excel のステータスバー）

export interface RangeSummary {
  /** 空でないセルの数（Excel の「データの個数」）。 */
  count: number
  /** 数値として読めたセルの数。 */
  numericCount: number
  sum: number
  average: number | null
}

/** 範囲の集計。数値は桁区切り・通貨記号・% を取り除いて読む。 */
export function summarizeRange(table: TableElement, range: CellRange): RangeSummary {
  let count = 0
  let numericCount = 0
  let sum = 0
  forEachCell(table, range, (cell) => {
    const text = cell.text.trim()
    if (!text) return
    count += 1
    if (!looksNumeric(text)) return
    const negative = /^\(.*\)$/.test(text) || text.startsWith('-')
    const value = Number(text.replace(/[(),¥$€£%\s+-]/g, ''))
    if (!Number.isFinite(value)) return
    numericCount += 1
    sum += negative ? -value : value
  })
  return { count, numericCount, sum, average: numericCount > 0 ? sum / numericCount : null }
}

// ---------------------------------------------------------------- 番地（A1 形式）

/** 列番号（0 始まり）を Excel の列名（A, B, …, Z, AA, …）にする。 */
export function columnName(col: number): string {
  let name = ''
  let n = col + 1
  while (n > 0) {
    const rest = (n - 1) % 26
    name = String.fromCharCode(65 + rest) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** セルの番地（例: B2）。 */
export function cellAddress(pos: CellPos): string {
  return `${columnName(pos.col)}${pos.row + 1}`
}

/** 範囲の番地（例: B2:C3。1 セルなら B2）。 */
export function rangeAddress(range: CellRange): string {
  const start = cellAddress({ row: range.top, col: range.left })
  if (range.top === range.bottom && range.left === range.right) return start
  return `${start}:${cellAddress({ row: range.bottom, col: range.right })}`
}
