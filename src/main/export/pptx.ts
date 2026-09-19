/**
 * `.pptx` 書き出し。論理 px のモデルを pptxgenjs の inch / pt へ換算する。
 *
 * 96px = 1inch としているため、スライドは 13.3333 x 7.5 inch
 * （PowerPoint のワイド画面既定サイズ）に一致し、フォントは px * 0.75 = pt になる。
 */
import PptxGenJS from 'pptxgenjs'
import {
  runsToPlainText,
  type Deck,
  type ImageElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TextElement,
  type TextRun,
  type Theme,
} from '@shared/deck'
import { pxToInch, pxToPt, SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from '@shared/geometry'
import { resolveTheme } from '@shared/themes'
import { pptxFontFor } from '@shared/fonts'

const LAYOUT_NAME = 'POWER_SLIDE_16x9'

/** PowerPoint 側で日本語として扱われるように言語を明示する。 */
const TEXT_LANG = 'ja-JP'

/** pptxgenjs の色は `#` なしの 6 桁 HEX。 */
function hex(color: string | undefined, fallback: string): string {
  const value = (color && color.trim()) || fallback
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value)
  if (match) return match[1].toUpperCase()
  const short = /^#?([0-9a-fA-F]{3})$/.exec(value)
  if (short) {
    return short[1]
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()
  }
  return fallback.replace('#', '').toUpperCase()
}

/**
 * 画面表示用の font-family から、pptx に書くフォント名を決める。
 * アプリは同梱の Noto で描くが、pptx は受け取った側の PowerPoint で開かれるため、
 * Windows / Office に標準で入っている書体を指定する（`shared/fonts.ts`）。
 */
function primaryFont(fontFamily: string, fallback: string): string {
  return pptxFontFor(fontFamily, fallback)
}

function textRunsToPptx(
  runs: TextRun[],
  defaults: { color: string; fontFace: string; fontSize: number },
): PptxGenJS.TextProps[] {
  return runs.map((run) => ({
    text: run.text,
    options: {
      bold: run.bold === true,
      italic: run.italic === true,
      underline: run.underline === true ? { style: 'sng' as const } : undefined,
      color: hex(run.color, defaults.color),
      fontFace: defaults.fontFace,
      fontSize: defaults.fontSize,
      lang: TEXT_LANG,
      // 同じ要素内の run は改行せずに続ける（改行は文字列中の \n から生成される）
      breakLine: false,
    },
  }))
}

function addTextElement(slide: PptxGenJS.Slide, element: TextElement, theme: Theme): void {
  const isTitle = element.role === 'title'
  const color = hex(
    element.runs.find((run) => run.color)?.color,
    isTitle ? theme.titleColor : theme.bodyColor,
  )
  const fontFace = primaryFont(element.fontFamily, isTitle ? theme.titleFont : theme.bodyFont)
  const fontSize = pxToPt(element.fontSize)

  slide.addText(textRunsToPptx(element.runs, { color, fontFace, fontSize }), {
    x: pxToInch(element.x),
    y: pxToInch(element.y),
    w: pxToInch(element.w),
    h: pxToInch(element.h),
    align: element.align,
    valign: element.vAlign === 'middle' ? 'middle' : element.vAlign === 'bottom' ? 'bottom' : 'top',
    fontFace,
    fontSize,
    color,
    lineSpacingMultiple: Number(element.lineHeight.toFixed(2)),
    rotate: element.rotation || undefined,
    margin: 0,
    wrap: true,
    // 論理座標のボックスに合わせるため、自動縮小・自動拡大はしない
    shrinkText: false,
  })
}

const SHAPE_TYPE: Record<ShapeElement['shape'], PptxGenJS.ShapeType> = {
  rect: 'rect' as PptxGenJS.ShapeType,
  roundRect: 'roundRect' as PptxGenJS.ShapeType,
  ellipse: 'ellipse' as PptxGenJS.ShapeType,
  triangle: 'triangle' as PptxGenJS.ShapeType,
  line: 'line' as PptxGenJS.ShapeType,
  arrow: 'line' as PptxGenJS.ShapeType,
}

function addShapeElement(slide: PptxGenJS.Slide, element: ShapeElement, theme: Theme): void {
  const isLine = element.shape === 'line' || element.shape === 'arrow'
  const strokeColor = hex(element.stroke || (isLine ? theme.accent : ''), theme.accent)

  const options: PptxGenJS.ShapeProps = {
    x: pxToInch(element.x),
    y: pxToInch(element.y),
    w: pxToInch(element.w),
    h: pxToInch(isLine ? 0 : element.h),
    rotate: element.rotation || undefined,
  }

  if (isLine) {
    options.line = {
      color: strokeColor,
      width: Math.max(0.5, pxToPt(element.strokeWidth || 2)),
      endArrowType: element.shape === 'arrow' ? 'triangle' : undefined,
    }
  } else {
    options.fill = element.fill ? { color: hex(element.fill, theme.accent) } : { type: 'none' }
    if (element.strokeWidth > 0 && element.stroke) {
      options.line = { color: strokeColor, width: Math.max(0.5, pxToPt(element.strokeWidth)) }
    }
  }

  slide.addShape(SHAPE_TYPE[element.shape], options)

  if (element.text && runsToPlainText(element.text.runs).length > 0) {
    const fontFace = primaryFont(element.text.fontFamily, theme.bodyFont)
    const fontSize = pxToPt(element.text.fontSize)
    const color = hex(element.text.runs.find((run) => run.color)?.color, theme.bodyColor)
    slide.addText(textRunsToPptx(element.text.runs, { color, fontFace, fontSize }), {
      x: pxToInch(element.x),
      y: pxToInch(element.y),
      w: pxToInch(element.w),
      h: pxToInch(element.h),
      align: element.text.align,
      valign: 'middle',
      fontFace,
      fontSize,
      color,
      margin: 0,
      rotate: element.rotation || undefined,
    })
  }
}

function addImageElement(slide: PptxGenJS.Slide, element: ImageElement): void {
  slide.addImage({
    data: element.dataUrl,
    x: pxToInch(element.x),
    y: pxToInch(element.y),
    w: pxToInch(element.w),
    h: pxToInch(element.h),
    rotate: element.rotation || undefined,
    sizing: {
      type: element.fit === 'cover' ? 'cover' : 'contain',
      w: pxToInch(element.w),
      h: pxToInch(element.h),
    },
  })
}

function addElement(slide: PptxGenJS.Slide, element: SlideElement, theme: Theme): void {
  switch (element.type) {
    case 'text':
      addTextElement(slide, element, theme)
      break
    case 'shape':
      addShapeElement(slide, element, theme)
      break
    case 'image':
      addImageElement(slide, element)
      break
  }
}

function addSlide(pptx: PptxGenJS, source: Slide, theme: Theme): void {
  const slide = pptx.addSlide()
  slide.background = { color: hex(source.background?.color, theme.background) }
  for (const element of source.elements) {
    addElement(slide, element, theme)
  }
  if (source.notes.trim().length > 0) {
    slide.addNotes(source.notes)
  }
}

/** Deck を .pptx のバイト列に変換する。 */
export async function deckToPptxBuffer(deck: Deck): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN })
  pptx.layout = LAYOUT_NAME
  pptx.title = deck.title

  const theme = resolveTheme(deck.themeId, deck.theme)
  for (const slide of deck.slides) {
    addSlide(pptx, slide, theme)
  }

  const data = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return data
}
