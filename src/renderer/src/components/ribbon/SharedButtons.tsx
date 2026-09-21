/** 複数のタブに同じ形で出てくるボタン（新しいスライド・図形）。 */
import { useMemo } from 'react'
import type { ShapeKind } from '@shared/deck'
import { SLIDE_WIDTH } from '@shared/geometry'
import { buildSlideFromLayout, DEFAULT_LAYOUT_ID, LAYOUTS } from '@shared/layouts'
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../../store/deckStore'
import { insertShape } from '../../lib/commands'
import { Icon, type IconName } from '../Icon'
import { SlideView } from '../SlideView'
import { BigMenuButton, BigSplitButton } from './RibbonParts'

/** レイアウト一覧の縮小表示の幅（px）。 */
const LAYOUT_THUMB_WIDTH = 112

/**
 * 「新しいスライド」。本体を押すと前回選んだレイアウトで追加し、
 * ▾ からはレイアウトの一覧（縮小表示）を選べる。
 */
export function NewSlideButton() {
  const addSlide = useDeckStore((state) => state.addSlide)
  const lastLayoutId = useDeckStore((state) => state.lastLayoutId)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const theme = resolveTheme(themeId, customTheme)

  // 一覧に出す見本のスライド。id はその場限りなので描画のたびに作らず memo する
  const samples = useMemo(
    () => LAYOUTS.map((layout) => ({ layout, slide: buildSlideFromLayout(layout.id) })),
    [],
  )

  return (
    <BigSplitButton
      icon="newSlide"
      label="新しいスライド"
      menuLabel="スライドのレイアウトを選ぶ"
      onClick={() => addSlide(lastLayoutId ?? DEFAULT_LAYOUT_ID)}
      menu={(close) => (
        <div className="layout-gallery" role="menu">
          <div className="gallery-title">レイアウト</div>
          <div className="layout-gallery-grid">
            {samples.map(({ layout, slide }) => (
              <button
                key={layout.id}
                type="button"
                role="menuitem"
                className={['layout-card', layout.id === lastLayoutId ? 'is-active' : '']
                  .join(' ')
                  .trim()}
                aria-label={layout.name}
                onClick={() => {
                  close()
                  addSlide(layout.id)
                }}
              >
                <div className="layout-card-thumb">
                  <SlideView slide={slide} theme={theme} scale={LAYOUT_THUMB_WIDTH / SLIDE_WIDTH} />
                </div>
                <span className="layout-card-name">{layout.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    />
  )
}

const SHAPES: { kind: ShapeKind; label: string; icon: IconName }[] = [
  { kind: 'rect', label: '四角形', icon: 'rect' },
  { kind: 'roundRect', label: '角丸四角形', icon: 'roundRect' },
  { kind: 'ellipse', label: '円・楕円', icon: 'ellipse' },
  { kind: 'triangle', label: '三角形', icon: 'triangle' },
  { kind: 'line', label: '直線', icon: 'line' },
  { kind: 'arrow', label: '矢印', icon: 'arrow' },
]

/** 「図形」。押すと図形の一覧が開く。 */
export function ShapesButton() {
  return (
    <BigMenuButton
      icon="shapes"
      label="図形"
      menu={(close) => (
        <div className="shape-gallery" role="menu">
          <div className="gallery-title">基本図形</div>
          <div className="shape-gallery-grid">
            {SHAPES.map((shape) => (
              <button
                key={shape.kind}
                type="button"
                role="menuitem"
                className="shape-card"
                onClick={() => {
                  close()
                  insertShape(shape.kind)
                }}
              >
                <Icon name={shape.icon} size={26} />
                <span>{shape.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    />
  )
}
