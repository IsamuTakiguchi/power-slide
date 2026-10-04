/**
 * `.pslide` ファイルのデータモデル。main / preload / renderer で共有する。
 *
 * 座標・サイズ・フォントサイズの単位はすべて `geometry.ts` の論理 px。
 */
import { newId } from './id'

/**
 * ファイル形式のバージョン。破壊的変更のたびに上げる。
 *
 * - 1: スライドの配列を直下に持つ（1 ファイル 1 シート）
 * - 2: Excel のように複数のシートを持てる（`sheets`）。1 の形式も読み込める
 */
export const SCHEMA_VERSION = 2

export const FILE_EXTENSION = 'pslide'

// ---------------------------------------------------------------- テーマ

export interface Theme {
  id: string
  name: string
  /** スライド背景色。 */
  background: string
  /** タイトル用の文字色。 */
  titleColor: string
  /** 本文用の文字色。 */
  bodyColor: string
  /** 差し色（図形の既定塗り、アクセント罫線など）。 */
  accent: string
  titleFont: string
  bodyFont: string
  /** 図形・文字色ピッカーに並べる配色。 */
  palette: string[]
}

// ---------------------------------------------------------------- 要素

export interface ElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** 度数法。0 は回転なし。 */
  rotation: number
}

export type TextAlign = 'left' | 'center' | 'right'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

/**
 * テキストの一部分。1 つの TextElement は runs の連結として描画される。
 * v1 の UI は要素全体に書式を適用するため runs は通常 1 個だが、
 * pptx 側が run 単位の書式を持つため、モデルも最初から run 配列で持つ。
 */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
}

export interface TextElement extends ElementBase {
  type: 'text'
  runs: TextRun[]
  fontFamily: string
  /** 論理 px。pptx へは pt に換算して書き出す。 */
  fontSize: number
  align: TextAlign
  vAlign: VerticalAlign
  lineHeight: number
  /**
   * テーマの配色・フォントを継承する目印。
   * 指定があるとき color/fontFamily が未設定なら、テーマの値で描画する。
   */
  role?: 'title' | 'body'
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'line' | 'arrow'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeKind
  fill?: string
  stroke?: string
  strokeWidth: number
  /** 図形の中に置くテキスト（省略可）。 */
  text?: {
    runs: TextRun[]
    fontFamily: string
    fontSize: number
    align: TextAlign
  }
}

export interface ImageElement extends ElementBase {
  type: 'image'
  /** 画像は dataURL で埋め込む。.pslide 1 ファイルで自己完結させ、リンク切れを防ぐ。 */
  dataUrl: string
  mime: string
  fit: 'contain' | 'cover'
  /** 元画像の縦横比（リサイズ時の縦横比固定に使う）。 */
  naturalRatio?: number
}

/** 表の 1 セル。書式は省略時に表全体の既定（見出し行・縞模様など）に従う。 */
export interface TableCell {
  text: string
  bold?: boolean
  /** 文字色。 */
  color?: string
  /** 塗りつぶし。 */
  fill?: string
  align?: TextAlign
}

/**
 * 表。Excel と同じくセル単位で入力・書式設定し、PowerPoint へは本物の表として書き出す。
 * 行の高さは全行同じ（要素の高さを行数で割る）、列幅は colWidths の比率で按分する。
 */
export interface TableElement extends ElementBase {
  type: 'table'
  /** rows[行][列]。どの行も列の数は同じ。 */
  rows: TableCell[][]
  /** 列幅の比率（合計は任意）。 */
  colWidths: number[]
  /** 空ならテーマの本文フォント。 */
  fontFamily: string
  /** 論理 px。 */
  fontSize: number
  /** 1 行目を見出しとして差し色で塗る。 */
  headerRow: boolean
  /** 1 行おきに薄く塗る（縞模様）。 */
  bandedRows: boolean
  /** 最初の列を太字にする。 */
  firstColumn: boolean
  /** 罫線の色。空ならテーマに合わせた灰色。 */
  borderColor: string
  /** 見出し行の塗り。空ならテーマの差し色。 */
  headerFill: string
}

export type SlideElement = TextElement | ShapeElement | ImageElement | TableElement

export type ElementType = SlideElement['type']

// ---------------------------------------------------------------- スライド

export interface Background {
  type: 'color'
  color: string
}

export interface Slide {
  id: string
  /** 生成元のレイアウト ID（`layouts.ts`）。表示には影響せず、履歴として持つ。 */
  layoutId: string
  /** 未指定ならテーマの背景を使う。 */
  background?: Background
  elements: SlideElement[]
  notes: string
}

/**
 * シート。Excel のシートと同じく 1 ファイルに複数持てて、画面下の見出しで切り替える。
 * それぞれが独立したスライドの並びを持つ（例:「本編」「付録」、v1.0 と v1.1 など）。
 */
export interface Sheet {
  id: string
  /** シート見出しに出す名前。ファイル内で重複させない。 */
  name: string
  /** シート見出しの色（Excel の「シート見出しの色」）。未指定なら色なし。 */
  color?: string
  /** 必ず 1 枚以上。 */
  slides: Slide[]
}

export interface Deck {
  schemaVersion: number
  title: string
  themeId: string
  /** 既定テーマを編集した場合のみ持つ。テーマはファイル全体（全シート）で共通。 */
  theme?: Theme
  /** 開いているシートの番号。保存しておき、次に開いたときも同じシートから始める。 */
  activeSheet: number
  /** 必ず 1 枚以上。 */
  sheets: Sheet[]
}

/** シート名の長さの上限（Excel と同じ 31 文字）。 */
export const MAX_SHEET_NAME_LENGTH = 31

// ---------------------------------------------------------------- ファクトリ

export function createTextElement(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: newId('el'),
    type: 'text',
    x: 140,
    y: 300,
    w: 1000,
    h: 120,
    rotation: 0,
    runs: [{ text: 'テキスト' }],
    fontFamily: '',
    fontSize: 32,
    align: 'left',
    vAlign: 'top',
    lineHeight: 1.4,
    ...partial,
  }
}

export function createShapeElement(partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: newId('el'),
    type: 'shape',
    shape: 'rect',
    x: 480,
    y: 260,
    w: 320,
    h: 200,
    rotation: 0,
    stroke: '',
    strokeWidth: 2,
    ...partial,
  }
}

export function createImageElement(partial: Partial<ImageElement> & Pick<ImageElement, 'dataUrl' | 'mime'>): ImageElement {
  return {
    id: newId('el'),
    type: 'image',
    x: 340,
    y: 160,
    w: 600,
    h: 400,
    rotation: 0,
    fit: 'contain',
    ...partial,
  }
}

/** 空の表をつくる。行・列の数は 1 以上。 */
export function createTableElement(
  rowCount: number,
  colCount: number,
  partial: Partial<TableElement> = {},
): TableElement {
  const rows = Math.max(1, rowCount)
  const cols = Math.max(1, colCount)
  return {
    id: newId('el'),
    type: 'table',
    x: 140,
    y: 160,
    w: 1000,
    h: Math.min(440, rows * 48),
    rotation: 0,
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: '' }))),
    colWidths: Array.from({ length: cols }, () => 1),
    fontFamily: '',
    fontSize: 22,
    headerRow: true,
    bandedRows: true,
    firstColumn: false,
    borderColor: '',
    headerFill: '',
    ...partial,
  }
}

export function createSlide(partial: Partial<Slide> = {}): Slide {
  return {
    id: newId('sl'),
    layoutId: 'blank',
    elements: [],
    notes: '',
    ...partial,
  }
}

export function createSheet(name: string, slides: Slide[] = [createSlide()]): Sheet {
  return { id: newId('sh'), name, slides }
}

// ---------------------------------------------------------------- シートの参照

/** 開いているシート。番号が範囲外でも必ずどれかを返す。 */
export function activeSheetOf(deck: Deck): Sheet {
  return deck.sheets[clampSheetIndex(deck, deck.activeSheet)] ?? deck.sheets[0]
}

/** 開いているシートのスライド。編集・発表はこれを対象にする。 */
export function activeSlides(deck: Deck): Slide[] {
  return activeSheetOf(deck).slides
}

/** 全シートのスライドを、シートの並び順に連結したもの（書き出し用）。 */
export function allSlides(deck: Deck): Slide[] {
  return deck.sheets.flatMap((sheet) => sheet.slides)
}

export function clampSheetIndex(deck: Deck, index: number): number {
  return Math.min(Math.max(0, Math.trunc(index) || 0), Math.max(0, deck.sheets.length - 1))
}

/** まだ使われていない「シートN」という名前を返す（Excel の新しいシートと同じ付け方）。 */
export function nextSheetName(sheets: Pick<Sheet, 'name'>[]): string {
  const used = new Set(sheets.map((sheet) => sheet.name))
  for (let n = sheets.length + 1; ; n += 1) {
    const name = `シート${n}`
    if (!used.has(name)) return name
  }
}

/**
 * 既存の名前と重ならないようにする。重なるときは Excel の複製と同じく「名前 (2)」の形にする。
 */
export function uniqueSheetName(base: string, sheets: Pick<Sheet, 'name'>[]): string {
  const used = new Set(sheets.map((sheet) => sheet.name))
  if (!used.has(base)) return base
  const stem = base.replace(/ \(\d+\)$/, '')
  for (let n = 2; ; n += 1) {
    const name = `${stem} (${n})`
    if (!used.has(name)) return name
  }
}

/** TextElement / ShapeElement.text の全文を取り出す。 */
export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((run) => run.text).join('')
}
