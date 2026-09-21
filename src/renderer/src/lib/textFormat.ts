/**
 * リボンの「フォント」「段落」グループから、選択中の要素の文字書式を読み書きするヘルパー。
 *
 * 対象はテキスト要素か、テキストを持つ図形。どちらも run 配列を持つので、
 * ここで差を吸収してリボン側は 1 種類の API だけを扱えるようにする。
 */
import type { ShapeElement, SlideElement, TextAlign, TextElement, TextRun, VerticalAlign } from '@shared/deck'
import { useDeckStore } from '../store/deckStore'

export interface TextFormat {
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string | undefined
  align: TextAlign
  /** 図形内テキストには縦位置の設定がないので undefined。 */
  vAlign: VerticalAlign | undefined
}

type TextBearing = TextElement | (ShapeElement & { text: NonNullable<ShapeElement['text']> })

/** 選択中の要素のうち、文字書式を持つ最初のもの。 */
export function findTextTarget(elements: SlideElement[]): TextBearing | null {
  for (const element of elements) {
    if (element.type === 'text') return element
    if (element.type === 'shape' && element.text) return element as TextBearing
  }
  return null
}

export function readTextFormat(target: TextBearing): TextFormat {
  const runs = target.type === 'text' ? target.runs : target.text.runs
  const lead: TextRun = runs[0] ?? { text: '' }
  return {
    fontFamily: target.type === 'text' ? target.fontFamily : target.text.fontFamily,
    fontSize: target.type === 'text' ? target.fontSize : target.text.fontSize,
    bold: lead.bold === true,
    italic: lead.italic === true,
    underline: lead.underline === true,
    color: lead.color,
    align: target.type === 'text' ? target.align : target.text.align,
    vAlign: target.type === 'text' ? target.vAlign : undefined,
  }
}

/** run 単位の書式（太字など）を、対象の全 run に適用する。 */
function patchRuns(target: TextBearing, patch: Partial<Omit<TextRun, 'text'>>): void {
  const { updateElement } = useDeckStore.getState()
  const apply = (runs: TextRun[]) => runs.map((run) => ({ ...run, ...patch }))
  if (target.type === 'text') {
    updateElement(target.id, { runs: apply(target.runs) })
  } else {
    updateElement(target.id, { text: { ...target.text, runs: apply(target.text.runs) } })
  }
}

/** 要素単位の書式（フォント・サイズ・配置）を適用する。 */
function patchBlock(
  target: TextBearing,
  patch: Partial<Pick<TextElement, 'fontFamily' | 'fontSize' | 'align' | 'vAlign'>>,
): void {
  const { updateElement } = useDeckStore.getState()
  if (target.type === 'text') {
    updateElement(target.id, patch)
    return
  }
  // 図形内テキストは vAlign を持たないので、それ以外だけを写す
  const text = { ...target.text }
  if (patch.fontFamily !== undefined) text.fontFamily = patch.fontFamily
  if (patch.fontSize !== undefined) text.fontSize = patch.fontSize
  if (patch.align !== undefined) text.align = patch.align
  updateElement(target.id, { text })
}

export const textFormatActions = {
  setFontFamily: (target: TextBearing, fontFamily: string) => patchBlock(target, { fontFamily }),
  setFontSize: (target: TextBearing, fontSize: number) =>
    patchBlock(target, { fontSize: Math.min(200, Math.max(8, Math.round(fontSize))) }),
  toggleBold: (target: TextBearing) => patchRuns(target, { bold: !readTextFormat(target).bold }),
  toggleItalic: (target: TextBearing) =>
    patchRuns(target, { italic: !readTextFormat(target).italic }),
  toggleUnderline: (target: TextBearing) =>
    patchRuns(target, { underline: !readTextFormat(target).underline }),
  setColor: (target: TextBearing, color: string | undefined) => patchRuns(target, { color }),
  setAlign: (target: TextBearing, align: TextAlign) => patchBlock(target, { align }),
  setVAlign: (target: TextBearing, vAlign: VerticalAlign) => patchBlock(target, { vAlign }),
}

/** PowerPoint の「フォントサイズの拡大／縮小」と同じ刻み（pt 換算ではなく px のまま）。 */
const SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 120, 144, 200]

export function nextFontSize(current: number, direction: 1 | -1): number {
  if (direction > 0) return SIZE_STEPS.find((step) => step > current) ?? current
  return [...SIZE_STEPS].reverse().find((step) => step < current) ?? current
}

export { SIZE_STEPS as FONT_SIZE_STEPS }
