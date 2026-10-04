/** 複数のタブに同じ形で出てくるボタン（新しいスライド・図形・表）。 */
import { useMemo, useState } from 'react'
import type { ShapeKind } from '@shared/deck'
import { SLIDE_WIDTH } from '@shared/geometry'
import { buildSlideFromLayout, DEFAULT_LAYOUT_ID, LAYOUTS } from '@shared/layouts'
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../../store/deckStore'
import { insertShape } from '../../lib/commands'
import { insertTable } from '../../lib/tableCommands'
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

/** 表の大きさを選ぶマス目の数（Office と同じ 10 列 × 8 行）。 */
const PICKER_ROWS = 8
const PICKER_COLS = 10

/** マス目をなぞって大きさを選び、押すとその大きさの表を入れる（指ではマス目を押すだけ）。 */
function TablePicker({ close }: { close: () => void }) {
  const [hover, setHover] = useState({ rows: 0, cols: 0 })
  return (
    <div className="table-picker" role="menu" aria-label="表の大きさ">
      <div className="gallery-title">
        {hover.rows > 0 ? `${hover.rows} 行 × ${hover.cols} 列の表` : '表の大きさを選ぶ'}
      </div>
      <div
        className="table-picker-grid"
        style={{ gridTemplateColumns: `repeat(${PICKER_COLS}, 1fr)` }}
        onPointerLeave={() => setHover({ rows: 0, cols: 0 })}
      >
        {Array.from({ length: PICKER_ROWS * PICKER_COLS }, (_, index) => {
          const rows = Math.floor(index / PICKER_COLS) + 1
          const cols = (index % PICKER_COLS) + 1
          const lit = rows <= hover.rows && cols <= hover.cols
          return (
            <button
              key={index}
              type="button"
              role="menuitem"
              aria-label={`${rows} 行 × ${cols} 列`}
              className={['table-picker-cell', lit ? 'is-on' : ''].filter(Boolean).join(' ')}
              onPointerEnter={() => setHover({ rows, cols })}
              onFocus={() => setHover({ rows, cols })}
              onClick={() => {
                close()
                insertTable(rows, cols)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** 「表」。押すとマス目が開き、大きさを選んで挿入する。 */
export function TableButton() {
  return <BigMenuButton icon="table" label="表" menu={(close) => <TablePicker close={close} />} />
}
