/**
 * 編集キャンバス。
 *
 * スライド本体は SlideView（論理座標を CSS scale で縮小）で描き、
 * 選択枠とリサイズハンドルはその上の画面座標レイヤーに置く。
 * こうするとズーム倍率に関係なくハンドルの大きさが一定になる。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useDeckStore } from '../store/deckStore'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'
import type { SlideElement } from '@shared/deck'
import { resolveTheme } from '@shared/themes'
import { SlideView } from './SlideView'
import { snapMove, type Guide, type Rect } from '../lib/snapping'

/** 要素の最小サイズ（論理 px）。 */
const MIN_SIZE = 16

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const HANDLES: { id: HandleId; cursor: string; left: string; top: string }[] = [
  { id: 'nw', cursor: 'nwse-resize', left: '0%', top: '0%' },
  { id: 'n', cursor: 'ns-resize', left: '50%', top: '0%' },
  { id: 'ne', cursor: 'nesw-resize', left: '100%', top: '0%' },
  { id: 'e', cursor: 'ew-resize', left: '100%', top: '50%' },
  { id: 'se', cursor: 'nwse-resize', left: '100%', top: '100%' },
  { id: 's', cursor: 'ns-resize', left: '50%', top: '100%' },
  { id: 'sw', cursor: 'nesw-resize', left: '0%', top: '100%' },
  { id: 'w', cursor: 'ew-resize', left: '0%', top: '50%' },
]

interface DragState {
  kind: 'move' | 'resize'
  handle?: HandleId
  startX: number
  startY: number
  /** ドラッグ開始時点の対象要素の矩形。 */
  origin: Map<string, Rect>
}

function resizeRect(origin: Rect, handle: HandleId, dx: number, dy: number): Rect {
  let { x, y, w, h } = origin
  if (handle.includes('w')) {
    const nextW = Math.max(MIN_SIZE, origin.w - dx)
    x = origin.x + (origin.w - nextW)
    w = nextW
  }
  if (handle.includes('e')) {
    w = Math.max(MIN_SIZE, origin.w + dx)
  }
  if (handle.includes('n')) {
    const nextH = Math.max(MIN_SIZE, origin.h - dy)
    y = origin.y + (origin.h - nextH)
    h = nextH
  }
  if (handle.includes('s')) {
    h = Math.max(MIN_SIZE, origin.h + dy)
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

export function SlideCanvas() {
  const slide = useDeckStore((state) => state.deck.slides[state.slideIndex])
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const selectedIds = useDeckStore((state) => state.selectedIds)
  const editingId = useDeckStore((state) => state.editingId)
  const theme = resolveTheme(themeId, customTheme)

  const select = useDeckStore((state) => state.select)
  const toggleSelect = useDeckStore((state) => state.toggleSelect)
  const clearSelection = useDeckStore((state) => state.clearSelection)
  const setEditing = useDeckStore((state) => state.setEditing)
  const pushHistory = useDeckStore((state) => state.pushHistory)
  const endTransaction = useDeckStore((state) => state.endTransaction)

  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)
  const [guides, setGuides] = useState<Guide[]>([])
  const dragRef = useRef<DragState | null>(null)

  // 表示領域に合わせて倍率を決める
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => {
      const padding = 48
      const available = {
        width: node.clientWidth - padding,
        height: node.clientHeight - padding,
      }
      const next = Math.min(available.width / SLIDE_WIDTH, available.height / SLIDE_HEIGHT)
      setScale(Math.max(0.2, Math.min(1.5, next)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /** ドラッグ対象（選択中の要素）の開始矩形を集める。 */
  const collectOrigin = useCallback(
    (ids: string[]): Map<string, Rect> => {
      const map = new Map<string, Rect>()
      const elements = slide?.elements ?? []
      for (const element of elements) {
        if (!ids.includes(element.id)) continue
        map.set(element.id, { x: element.x, y: element.y, w: element.w, h: element.h })
      }
      return map
    },
    [slide],
  )

  const beginMove = (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (editingId) return
    const additive = event.shiftKey
    let ids: string[]
    if (additive) {
      toggleSelect(id)
      ids = selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id]
    } else if (selectedIds.includes(id)) {
      ids = selectedIds
    } else {
      select([id])
      ids = [id]
    }
    if (ids.length === 0) return

    pushHistory()
    dragRef.current = {
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      origin: collectOrigin(ids),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const beginResize = (handle: HandleId, event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (selectedIds.length === 0) return
    pushHistory()
    dragRef.current = {
      kind: 'resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: collectOrigin(selectedIds),
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  // ドラッグ中の移動・リサイズ。history は開始時に 1 回積んでいるので editLive を使う。
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.startX) / scale
      const dy = (event.clientY - drag.startY) / scale
      const store = useDeckStore.getState()
      const current = store.deck.slides[store.slideIndex]
      if (!current) return

      const others: Rect[] = current.elements
        .filter((element) => !drag.origin.has(element.id))
        .map((element) => ({ x: element.x, y: element.y, w: element.w, h: element.h }))

      const patches = new Map<string, Partial<SlideElement>>()
      let nextGuides: Guide[] = []

      if (drag.kind === 'move') {
        // 複数選択時は先頭要素でスナップを計算し、同じ差分を全体に適用する
        const [firstId] = [...drag.origin.keys()]
        const first = drag.origin.get(firstId)
        let appliedDx = dx
        let appliedDy = dy
        if (first) {
          const moved: Rect = { ...first, x: first.x + dx, y: first.y + dy }
          const snapped = snapMove(moved, others)
          appliedDx = snapped.x - first.x
          appliedDy = snapped.y - first.y
          nextGuides = snapped.guides
        }
        for (const [id, origin] of drag.origin) {
          patches.set(id, {
            x: Math.round(origin.x + appliedDx),
            y: Math.round(origin.y + appliedDy),
          })
        }
      } else if (drag.handle) {
        for (const [id, origin] of drag.origin) {
          patches.set(id, resizeRect(origin, drag.handle, dx, dy))
        }
      }

      store.editLive((deck) => {
        const target = deck.slides[store.slideIndex]
        if (!target) return
        target.elements = target.elements.map((element) => {
          const patch = patches.get(element.id)
          return patch ? ({ ...element, ...patch } as SlideElement) : element
        })
      })
      setGuides(nextGuides)
    }

    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setGuides([])
      endTransaction()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [scale, endTransaction])

  if (!slide) return null

  const selection = slide.elements.filter((element) => selectedIds.includes(element.id))
  const bounds =
    selection.length > 0
      ? {
          x: Math.min(...selection.map((element) => element.x)),
          y: Math.min(...selection.map((element) => element.y)),
          right: Math.max(...selection.map((element) => element.x + element.w)),
          bottom: Math.max(...selection.map((element) => element.y + element.h)),
        }
      : null

  return (
    <div className="canvas-area" ref={containerRef}>
      <div className="canvas-stage" style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
        <SlideView
          slide={slide}
          theme={theme}
          scale={scale}
          interactive
          selectedIds={selectedIds}
          editingId={editingId}
          onElementPointerDown={beginMove}
          onElementDoubleClick={(id) => {
            const element = slide.elements.find((item) => item.id === id)
            if (element?.type === 'text') setEditing(id)
            else select([id])
          }}
          onBackgroundPointerDown={() => {
            clearSelection()
          }}
          onCommitText={(id, text) => {
            const element = slide.elements.find((item) => item.id === id)
            if (element?.type !== 'text') return
            const lead = element.runs[0] ?? { text: '' }
            useDeckStore.getState().updateElement(id, { runs: [{ ...lead, text }] })
          }}
          onFinishEditing={() => setEditing(null)}
        />

        {/* スナップのガイド線 */}
        {guides.map((guide, index) =>
          guide.orientation === 'vertical' ? (
            <div key={index} className="snap-guide is-vertical" style={{ left: guide.position * scale }} />
          ) : (
            <div key={index} className="snap-guide is-horizontal" style={{ top: guide.position * scale }} />
          ),
        )}

        {/* 選択枠とハンドル（画面座標） */}
        {bounds && !editingId && (
          <div
            className="selection-box"
            style={{
              left: bounds.x * scale,
              top: bounds.y * scale,
              width: (bounds.right - bounds.x) * scale,
              height: (bounds.bottom - bounds.y) * scale,
            }}
          >
            {HANDLES.map((handle) => (
              <div
                key={handle.id}
                className="selection-handle"
                style={{ left: handle.left, top: handle.top, cursor: handle.cursor }}
                onPointerDown={(event) => beginResize(handle.id, event)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
