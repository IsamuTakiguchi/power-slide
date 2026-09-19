/**
 * スライドの論理座標系。
 *
 * すべての要素座標・サイズ・フォントサイズは「1280x720 の論理 px」で保持する。
 * 画面表示は親コンテナに CSS transform: scale() をかけるだけなので、編集画面・
 * サムネイル・発表画面・画像書き出しがすべて同一のレイアウトになる。
 *
 * PowerPoint 換算は 96px = 1inch（CSS の標準 DPI）。
 * したがってスライドは 13.3333 x 7.5 inch = PowerPoint のワイド画面既定サイズと一致し、
 * フォントサイズは px * 0.75 でそのまま pt になる。
 */
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

/** 論理 px / inch。CSS の標準 DPI と同じ。 */
export const PX_PER_INCH = 96

/** PowerPoint スライドの寸法（inch）。 */
export const SLIDE_WIDTH_IN = SLIDE_WIDTH / PX_PER_INCH // 13.3333
export const SLIDE_HEIGHT_IN = SLIDE_HEIGHT / PX_PER_INCH // 7.5

/** 論理 px を inch に変換する（pptxgenjs 用）。 */
export function pxToInch(px: number): number {
  return px / PX_PER_INCH
}

/** 論理 px を pt に変換する（フォントサイズ用）。96px/inch, 72pt/inch なので 0.75 倍。 */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75 * 100) / 100
}

/** 値を [min, max] に収める。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
