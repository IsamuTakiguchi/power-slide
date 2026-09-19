/**
 * `.pslide` ファイルのデータモデル。main / preload / renderer で共有する。
 *
 * 座標・サイズ・フォントサイズの単位はすべて `geometry.ts` の論理 px。
 */
import { newId } from './id'

/** ファイル形式のバージョン。破壊的変更のたびに上げる。 */
export const SCHEMA_VERSION = 1

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

export type SlideElement = TextElement | ShapeElement | ImageElement

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

export interface Deck {
  schemaVersion: number
  title: string
  themeId: string
  /** 既定テーマを編集した場合のみ持つ。 */
  theme?: Theme
  slides: Slide[]
}

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

export function createSlide(partial: Partial<Slide> = {}): Slide {
  return {
    id: newId('sl'),
    layoutId: 'blank',
    elements: [],
    notes: '',
    ...partial,
  }
}

/** TextElement / ShapeElement.text の全文を取り出す。 */
export function runsToPlainText(runs: TextRun[]): string {
  return runs.map((run) => run.text).join('')
}
