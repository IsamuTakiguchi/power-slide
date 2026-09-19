/**
 * 移動・リサイズ時のスナップ計算。
 * 他要素の端・中心と、スライドの端・中心に吸着させ、目印のガイド線を返す。
 */
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Guide {
  orientation: 'vertical' | 'horizontal'
  /** 論理座標（px）。 */
  position: number
}

/** 吸着する距離（論理 px）。 */
const THRESHOLD = 6

function candidates(values: number[], others: Rect[], axis: 'x' | 'y'): number[] {
  const result = axis === 'x' ? [0, SLIDE_WIDTH / 2, SLIDE_WIDTH] : [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT]
  for (const rect of others) {
    if (axis === 'x') result.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w)
    else result.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h)
  }
  return result.filter((value) => values.some((edge) => Math.abs(edge - value) <= THRESHOLD))
}

/**
 * 移動中の矩形を吸着させる。
 * 左端・中心・右端のうち、もっとも近い組み合わせを 1 つだけ採用する。
 */
export function snapMove(rect: Rect, others: Rect[]): { x: number; y: number; guides: Guide[] } {
  const guides: Guide[] = []
  let x = rect.x
  let y = rect.y

  const xEdges = [rect.x, rect.x + rect.w / 2, rect.x + rect.w]
  const yEdges = [rect.y, rect.y + rect.h / 2, rect.y + rect.h]

  let bestX: { delta: number; position: number } | null = null
  for (const target of candidates(xEdges, others, 'x')) {
    for (const edge of xEdges) {
      const delta = target - edge
      if (Math.abs(delta) > THRESHOLD) continue
      if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
        bestX = { delta, position: target }
      }
    }
  }
  if (bestX) {
    x = Math.round(rect.x + bestX.delta)
    guides.push({ orientation: 'vertical', position: bestX.position })
  }

  let bestY: { delta: number; position: number } | null = null
  for (const target of candidates(yEdges, others, 'y')) {
    for (const edge of yEdges) {
      const delta = target - edge
      if (Math.abs(delta) > THRESHOLD) continue
      if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
        bestY = { delta, position: target }
      }
    }
  }
  if (bestY) {
    y = Math.round(rect.y + bestY.delta)
    guides.push({ orientation: 'horizontal', position: bestY.position })
  }

  return { x, y, guides }
}
