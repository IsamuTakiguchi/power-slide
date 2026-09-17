/**
 * レイアウトテンプレート。選んだレイアウトから要素入りのスライドを生成する。
 * 生成後の要素は普通の要素なので、自由に動かしても構わない。
 */
import { createShapeElement, createSlide, createTextElement, SCHEMA_VERSION, type Deck, type Slide } from './deck'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from './geometry'
import { DEFAULT_THEME_ID } from './themes'

export interface LayoutDefinition {
  id: string
  name: string
  build: () => Slide
}

/** 左右の余白。 */
const MARGIN = 80
const CONTENT_WIDTH = SLIDE_WIDTH - MARGIN * 2

export const LAYOUTS: LayoutDefinition[] = [
  {
    id: 'title',
    name: 'タイトル',
    build: () =>
      createSlide({
        layoutId: 'title',
        elements: [
          createTextElement({
            role: 'title',
            runs: [{ text: 'タイトルを入力' }],
            x: MARGIN,
            y: 250,
            w: CONTENT_WIDTH,
            h: 130,
            fontSize: 64,
            align: 'center',
            vAlign: 'middle',
          }),
          createTextElement({
            role: 'body',
            runs: [{ text: 'サブタイトル' }],
            x: MARGIN,
            y: 395,
            w: CONTENT_WIDTH,
            h: 70,
            fontSize: 28,
            align: 'center',
            vAlign: 'middle',
          }),
        ],
      }),
  },
  {
    id: 'titleBody',
    name: 'タイトルと本文',
    build: () =>
      createSlide({
        layoutId: 'titleBody',
        elements: [
          createTextElement({
            role: 'title',
            runs: [{ text: 'タイトルを入力' }],
            x: MARGIN,
            y: 70,
            w: CONTENT_WIDTH,
            h: 90,
            fontSize: 44,
            vAlign: 'middle',
          }),
          createTextElement({
            role: 'body',
            runs: [{ text: '・本文を入力' }],
            x: MARGIN,
            y: 190,
            w: CONTENT_WIDTH,
            h: 440,
            fontSize: 28,
          }),
        ],
      }),
  },
  {
    id: 'twoColumn',
    name: '2 段組み',
    build: () => {
      const columnWidth = (CONTENT_WIDTH - 40) / 2
      return createSlide({
        layoutId: 'twoColumn',
        elements: [
          createTextElement({
            role: 'title',
            runs: [{ text: 'タイトルを入力' }],
            x: MARGIN,
            y: 70,
            w: CONTENT_WIDTH,
            h: 90,
            fontSize: 44,
            vAlign: 'middle',
          }),
          createTextElement({
            role: 'body',
            runs: [{ text: '・左側の内容' }],
            x: MARGIN,
            y: 190,
            w: columnWidth,
            h: 440,
            fontSize: 26,
          }),
          createTextElement({
            role: 'body',
            runs: [{ text: '・右側の内容' }],
            x: MARGIN + columnWidth + 40,
            y: 190,
            w: columnWidth,
            h: 440,
            fontSize: 26,
          }),
        ],
      })
    },
  },
  {
    id: 'sectionHeader',
    name: 'セクション区切り',
    build: () =>
      createSlide({
        layoutId: 'sectionHeader',
        elements: [
          createShapeElement({
            shape: 'rect',
            x: MARGIN,
            y: 330,
            w: 120,
            h: 8,
            strokeWidth: 0,
          }),
          createTextElement({
            role: 'title',
            runs: [{ text: 'セクション名' }],
            x: MARGIN,
            y: 360,
            w: CONTENT_WIDTH,
            h: 110,
            fontSize: 52,
            vAlign: 'middle',
          }),
        ],
      }),
  },
  {
    id: 'imageCaption',
    name: '画像と説明',
    build: () =>
      createSlide({
        layoutId: 'imageCaption',
        elements: [
          createTextElement({
            role: 'title',
            runs: [{ text: 'タイトルを入力' }],
            x: MARGIN,
            y: 70,
            w: CONTENT_WIDTH,
            h: 90,
            fontSize: 44,
            vAlign: 'middle',
          }),
          createShapeElement({
            shape: 'roundRect',
            x: MARGIN,
            y: 190,
            w: 640,
            h: 420,
            fill: '#e2e8f0',
            stroke: '#cbd5e1',
            strokeWidth: 2,
            text: {
              runs: [{ text: 'ここに画像を挿入', color: '#64748b' }],
              fontFamily: '',
              fontSize: 22,
              align: 'center',
            },
          }),
          createTextElement({
            role: 'body',
            runs: [{ text: '・説明を入力' }],
            x: MARGIN + 680,
            y: 190,
            w: CONTENT_WIDTH - 680,
            h: 420,
            fontSize: 24,
          }),
        ],
      }),
  },
  {
    id: 'blank',
    name: '白紙',
    build: () => createSlide({ layoutId: 'blank' }),
  },
]

export const DEFAULT_LAYOUT_ID = 'titleBody'

export function buildSlideFromLayout(layoutId: string): Slide {
  const layout = LAYOUTS.find((item) => item.id === layoutId) ?? LAYOUTS[LAYOUTS.length - 1]
  return layout.build()
}

/** 新規デッキの初期状態（タイトルスライド 1 枚）。 */
export function createStarterDeck(): Deck {
  return {
    schemaVersion: SCHEMA_VERSION,
    title: '無題のプレゼンテーション',
    themeId: DEFAULT_THEME_ID,
    slides: [buildSlideFromLayout('title')],
  }
}

/** スライド中央に要素を置くときの座標を求める。 */
export function centerPosition(w: number, h: number): { x: number; y: number } {
  return { x: Math.round((SLIDE_WIDTH - w) / 2), y: Math.round((SLIDE_HEIGHT - h) / 2) }
}
