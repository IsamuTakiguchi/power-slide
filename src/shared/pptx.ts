/**
 * `.pptx` の組み立て。論理 px のモデルを pptxgenjs の inch / pt へ換算する。
 *
 * 96px = 1inch としているため、スライドは 13.3333 x 7.5 inch
 * （PowerPoint のワイド画面既定サイズ）に一致し、フォントは px * 0.75 = pt になる。
 *
 * Electron（main）と Web 版の両方から使う。書き出し先（ファイル／ダウンロード）は
 * 呼び出し側が `write()` の outputType で決める。
 */
import PptxGenJS from 'pptxgenjs'
import {
  runsToPlainText,
  type Deck,
  type ImageElement,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TableElement,
  type TextElement,
  type TextRun,
  type Theme,
} from './deck'
import { pxToInch, pxToPt, SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN } from './geometry'
import { resolveTheme } from './themes'
import { pptxFontFor } from './fonts'
import { cellStyle, columnWidthsPx, tableColors } from './table'

/** 表のセルの余白（inch）。画面のセルの左右 10px・上下わずかに合わせる。 */
const TABLE_CELL_MARGIN_IN: [number, number, number, number] = [0.02, 10 / 96, 0.02, 10 / 96]

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
 * Windows / Office に標準で入っている書体を指定する（`fonts.ts`）。
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

/**
 * 表は PowerPoint の本物の表として書き出す（受け取った側でもセルを編集できるように）。
 * セルの色・太字・揃えは画面と同じ cellStyle で決める。
 */
function addTableElement(slide: PptxGenJS.Slide, element: TableElement, theme: Theme): void {
  const colors = tableColors(element, theme)
  const fontFace = primaryFont(element.fontFamily, theme.bodyFont)
  const fontSize = pxToPt(element.fontSize)
  const rows: PptxGenJS.TableRow[] = element.rows.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      const style = cellStyle(element, rowIndex, colIndex, colors)
      return {
        text: cell.text,
        options: {
          bold: style.bold,
          color: hex(style.color, theme.bodyColor),
          fill: { color: hex(style.fill, theme.background) },
          align: style.align,
          valign: 'middle' as const,
          lang: TEXT_LANG,
        },
      }
    }),
  )
  slide.addTable(rows, {
    x: pxToInch(element.x),
    y: pxToInch(element.y),
    w: pxToInch(element.w),
    h: pxToInch(element.h),
    colW: columnWidthsPx(element).map((width) => pxToInch(width)),
    rowH: pxToInch(element.h / element.rows.length),
    fontFace,
    fontSize,
    color: hex(colors.text, theme.bodyColor),
    border: { type: 'solid', pt: 0.75, color: hex(colors.border, '#BFBFBF') },
    margin: TABLE_CELL_MARGIN_IN,
    valign: 'middle',
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
    case 'table':
      addTableElement(slide, element, theme)
      break
  }
}

function addSlide(pptx: PptxGenJS, source: Slide, theme: Theme, sectionTitle?: string): void {
  const slide = pptx.addSlide(sectionTitle ? { sectionTitle } : undefined)
  slide.background = { color: hex(source.background?.color, theme.background) }
  for (const element of source.elements) {
    addElement(slide, element, theme)
  }
  if (source.notes.trim().length > 0) {
    slide.addNotes(source.notes)
  }
}

/**
 * Deck からプレゼンテーションを組み立てる。書き出しは呼び出し側で `write()` する。
 *
 * deck に入っているシートをすべて書き出す（どのシートを出すかは呼び出し側で絞る）。
 * シートが複数あるときは、シートを PowerPoint の「セクション」にして境目を残す。
 */
export function buildPptx(deck: Deck): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: LAYOUT_NAME, width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN })
  pptx.layout = LAYOUT_NAME
  pptx.title = deck.title

  const theme = resolveTheme(deck.themeId, deck.theme)
  const sectioned = deck.sheets.length > 1
  for (const sheet of deck.sheets) {
    if (sectioned) pptx.addSection({ title: sheet.name })
    for (const slide of sheet.slides) {
      addSlide(pptx, slide, theme, sectioned ? sheet.name : undefined)
    }
  }
  return pptx
}
