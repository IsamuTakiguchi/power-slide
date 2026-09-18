/**
 * 右ペイン。選択中の要素の書式と、スライド・デッキの設定をまとめる。
 * ここからの変更はすべて履歴に積む（ドラッグのような連続操作ではないため）。
 */
import type { ChangeEvent } from 'react'
import type { ShapeKind, SlideElement, TextAlign, VerticalAlign } from '@shared/deck'
import { resolveTheme } from '@shared/themes'
import { FONT_CHOICES } from '@shared/fonts'
import { useDeckStore } from '../store/deckStore'

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'テーマの既定', value: '' },
  ...FONT_CHOICES.map((choice) => ({ label: choice.label, value: choice.css })),
]

const ALIGN_OPTIONS: { label: string; value: TextAlign }[] = [
  { label: '左', value: 'left' },
  { label: '中央', value: 'center' },
  { label: '右', value: 'right' },
]

const VALIGN_OPTIONS: { label: string; value: VerticalAlign }[] = [
  { label: '上', value: 'top' },
  { label: '中央', value: 'middle' },
  { label: '下', value: 'bottom' },
]

const SHAPE_OPTIONS: { label: string; value: ShapeKind }[] = [
  { label: '四角形', value: 'rect' },
  { label: '角丸四角形', value: 'roundRect' },
  { label: '円・楕円', value: 'ellipse' },
  { label: '三角形', value: 'triangle' },
  { label: '直線', value: 'line' },
  { label: '矢印', value: 'arrow' },
]

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  palette,
  onChange,
  allowNone = false,
}: {
  label: string
  value: string
  palette: string[]
  onChange: (value: string) => void
  allowNone?: boolean
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="color-row">
        <input type="color" value={value || '#000000'} onChange={(event) => onChange(event.target.value)} />
        {palette.slice(0, 8).map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            title={color}
            onClick={() => onChange(color)}
          />
        ))}
        {allowNone && (
          <button type="button" className="swatch is-none" title="なし" onClick={() => onChange('')}>
            /
          </button>
        )}
      </div>
    </div>
  )
}

/** 単一選択の要素の書式パネル。 */
function ElementPanel({ element, palette }: { element: SlideElement; palette: string[] }) {
  const updateElement = useDeckStore((state) => state.updateElement)
  const reorderSelected = useDeckStore((state) => state.reorderSelected)
  const deleteSelected = useDeckStore((state) => state.deleteSelected)

  const patch = (values: Partial<SlideElement>) => updateElement(element.id, values)

  return (
    <>
      <section className="inspector-section">
        <h3>位置とサイズ</h3>
        <div className="field-grid">
          <NumberField label="X" value={element.x} onChange={(x) => patch({ x })} />
          <NumberField label="Y" value={element.y} onChange={(y) => patch({ y })} />
          <NumberField label="幅" value={element.w} min={8} onChange={(w) => patch({ w })} />
          <NumberField label="高さ" value={element.h} min={8} onChange={(h) => patch({ h })} />
          <NumberField
            label="回転(度)"
            value={element.rotation}
            min={-180}
            max={180}
            onChange={(rotation) => patch({ rotation })}
          />
        </div>
        <div className="button-row">
          <button type="button" onClick={() => reorderSelected('front')}>
            最前面へ
          </button>
          <button type="button" onClick={() => reorderSelected('forward')}>
            前へ
          </button>
          <button type="button" onClick={() => reorderSelected('backward')}>
            後ろへ
          </button>
          <button type="button" onClick={() => reorderSelected('back')}>
            最背面へ
          </button>
        </div>
        <div className="button-row">
          <button type="button" className="is-danger" onClick={deleteSelected}>
            この要素を削除
          </button>
        </div>
      </section>

      {element.type === 'text' && (
        <section className="inspector-section">
          <h3>文字</h3>
          <label className="field">
            フォント
            <select
              aria-label="フォント"
              value={element.fontFamily}
              onChange={(event) => patch({ fontFamily: event.target.value })}
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <NumberField
              label="サイズ"
              value={element.fontSize}
              min={8}
              max={200}
              onChange={(fontSize) => patch({ fontSize })}
            />
            <NumberField
              label="行間"
              value={element.lineHeight}
              min={0.8}
              max={3}
              step={0.05}
              onChange={(lineHeight) => patch({ lineHeight })}
            />
          </div>
          <div className="button-row">
            {(['bold', 'italic', 'underline'] as const).map((style) => {
              const lead = element.runs[0] ?? { text: '' }
              const active = lead[style] === true
              const labels = { bold: 'B', italic: 'I', underline: 'U' }
              return (
                <button
                  key={style}
                  type="button"
                  className={active ? 'is-active' : ''}
                  onClick={() =>
                    patch({
                      runs: element.runs.map((run) => ({ ...run, [style]: !active })),
                    })
                  }
                >
                  {labels[style]}
                </button>
              )
            })}
          </div>
          <label className="field">
            横方向
            <select
              value={element.align}
              onChange={(event) => patch({ align: event.target.value as TextAlign })}
            >
              {ALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            縦方向
            <select
              value={element.vAlign}
              onChange={(event) => patch({ vAlign: event.target.value as VerticalAlign })}
            >
              {VALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ColorField
            label="文字色"
            value={element.runs[0]?.color ?? ''}
            palette={palette}
            allowNone
            onChange={(color) =>
              patch({
                runs: element.runs.map((run) => ({
                  ...run,
                  color: color === '' ? undefined : color,
                })),
              })
            }
          />
        </section>
      )}

      {element.type === 'shape' && (
        <section className="inspector-section">
          <h3>図形</h3>
          <label className="field">
            種類
            <select
              value={element.shape}
              onChange={(event) => patch({ shape: event.target.value as ShapeKind })}
            >
              {SHAPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <ColorField
            label="塗り"
            value={element.fill ?? ''}
            palette={palette}
            allowNone
            onChange={(fill) => patch({ fill: fill === '' ? undefined : fill })}
          />
          <ColorField
            label="枠線"
            value={element.stroke ?? ''}
            palette={palette}
            allowNone
            onChange={(stroke) => patch({ stroke: stroke === '' ? undefined : stroke })}
          />
          <NumberField
            label="枠線の太さ"
            value={element.strokeWidth}
            min={0}
            max={40}
            onChange={(strokeWidth) => patch({ strokeWidth })}
          />
          <label className="field">
            図形内のテキスト
            <input
              type="text"
              value={element.text?.runs.map((run) => run.text).join('') ?? ''}
              onChange={(event) => {
                const text = event.target.value
                if (!text) {
                  patch({ text: undefined })
                  return
                }
                patch({
                  text: {
                    runs: [{ ...(element.text?.runs[0] ?? {}), text }],
                    fontFamily: element.text?.fontFamily ?? '',
                    fontSize: element.text?.fontSize ?? 22,
                    align: element.text?.align ?? 'center',
                  },
                })
              }}
            />
          </label>
        </section>
      )}

      {element.type === 'image' && (
        <section className="inspector-section">
          <h3>画像</h3>
          <label className="field">
            枠への収め方
            <select
              value={element.fit}
              onChange={(event) => patch({ fit: event.target.value as 'contain' | 'cover' })}
            >
              <option value="contain">全体を収める</option>
              <option value="cover">枠を埋める（はみ出しは隠す）</option>
            </select>
          </label>
          {element.naturalRatio && (
            <div className="button-row">
              <button
                type="button"
                onClick={() =>
                  patch({ h: Math.round(element.w / (element.naturalRatio as number)) })
                }
              >
                元の縦横比に戻す
              </button>
            </div>
          )}
        </section>
      )}
    </>
  )
}

export function Inspector() {
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const slide = useDeckStore((state) => state.deck.slides[state.slideIndex])
  const selectedIds = useDeckStore((state) => state.selectedIds)
  const setSlideBackground = useDeckStore((state) => state.setSlideBackground)

  const theme = resolveTheme(themeId, customTheme)
  const selection = slide?.elements.filter((element) => selectedIds.includes(element.id)) ?? []

  return (
    <aside className="inspector">
      {selection.length === 0 && (
        <section className="inspector-section">
          <h3>要素</h3>
          <p className="hint">
            スライド上の要素をクリックすると、ここで書式を調整できます。
            テキストはダブルクリックでその場で編集できます。
          </p>
        </section>
      )}

      {selection.length === 1 && <ElementPanel element={selection[0]} palette={theme.palette} />}

      {selection.length > 1 && (
        <section className="inspector-section">
          <h3>{selection.length} 個の要素を選択中</h3>
          <p className="hint">ドラッグでまとめて移動できます。書式は 1 つだけ選ぶと変更できます。</p>
        </section>
      )}

      <section className="inspector-section">
        <h3>スライドの背景</h3>
        <ColorField
          label="背景色"
          value={slide?.background?.color ?? theme.background}
          palette={theme.palette}
          allowNone
          onChange={(color) => setSlideBackground(color === '' ? null : color)}
        />
        <p className="hint">右端の「/」ボタンでテーマの背景色に戻ります。</p>
      </section>
    </aside>
  )
}
