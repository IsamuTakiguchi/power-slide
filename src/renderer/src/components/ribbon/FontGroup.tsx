/**
 * ホームタブの「フォント」「段落」グループ。
 * 選択中のテキスト（または図形内テキスト）に対して書式を変える。何も選んでいなければ無効。
 */
import { FONT_CHOICES } from '@shared/fonts'
import { useDeckStore } from '../../store/deckStore'
import {
  findTextTarget,
  FONT_SIZE_STEPS,
  nextFontSize,
  readTextFormat,
  textFormatActions as act,
} from '../../lib/textFormat'
import { Icon } from '../Icon'
import { RibbonGroup, SmallButton } from './RibbonParts'

const FONT_OPTIONS = [
  { label: 'テーマの既定', value: '' },
  ...FONT_CHOICES.map((choice) => ({ label: choice.label, value: choice.css })),
]

/** 選択中の要素から、文字書式の対象になる最初の要素を取り出す。 */
function useTextTarget() {
  return useDeckStore((state) => {
    const slide = state.deck.slides[state.slideIndex]
    if (!slide) return null
    return findTextTarget(slide.elements.filter((element) => state.selectedIds.includes(element.id)))
  })
}

export function FontGroup() {
  const target = useTextTarget()
  const format = target ? readTextFormat(target) : null
  const disabled = target === null

  return (
    <RibbonGroup label="フォント">
      <div className="ribbon-rows">
        <div className="ribbon-row">
          <select
            className="font-family"
            aria-label="フォント"
            disabled={disabled}
            value={format?.fontFamily ?? ''}
            onChange={(event) => target && act.setFontFamily(target, event.target.value)}
          >
            {FONT_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="font-size"
            type="number"
            aria-label="フォントサイズ"
            list="font-size-steps"
            min={8}
            max={200}
            disabled={disabled}
            value={format?.fontSize ?? ''}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (target && Number.isFinite(next)) act.setFontSize(target, next)
            }}
          />
          <datalist id="font-size-steps">
            {FONT_SIZE_STEPS.map((step) => (
              <option key={step} value={step} />
            ))}
          </datalist>
          <SmallButton
            icon="fontGrow"
            ariaLabel="フォントサイズの拡大"
            disabled={disabled}
            onClick={() => target && format && act.setFontSize(target, nextFontSize(format.fontSize, 1))}
          />
          <SmallButton
            icon="fontShrink"
            ariaLabel="フォントサイズの縮小"
            disabled={disabled}
            onClick={() => target && format && act.setFontSize(target, nextFontSize(format.fontSize, -1))}
          />
        </div>
        <div className="ribbon-row">
          <SmallButton
            icon="bold"
            ariaLabel="太字"
            disabled={disabled}
            active={format?.bold ?? false}
            onClick={() => target && act.toggleBold(target)}
          />
          <SmallButton
            icon="italic"
            ariaLabel="斜体"
            disabled={disabled}
            active={format?.italic ?? false}
            onClick={() => target && act.toggleItalic(target)}
          />
          <SmallButton
            icon="underline"
            ariaLabel="下線"
            disabled={disabled}
            active={format?.underline ?? false}
            onClick={() => target && act.toggleUnderline(target)}
          />
          <span className="ribbon-separator" />
          <label className={['ribbon-color', disabled ? 'is-disabled' : ''].join(' ').trim()} title="フォントの色">
            <Icon name="fontColor" size={18} />
            <span className="ribbon-color-bar" style={{ background: format?.color ?? '#1a1a1a' }} />
            <input
              type="color"
              aria-label="フォントの色"
              disabled={disabled}
              value={format?.color ?? '#1a1a1a'}
              onChange={(event) => target && act.setColor(target, event.target.value)}
            />
          </label>
          <SmallButton
            icon="close"
            ariaLabel="フォントの色をテーマの既定に戻す"
            disabled={disabled || !format?.color}
            onClick={() => target && act.setColor(target, undefined)}
          />
        </div>
      </div>
    </RibbonGroup>
  )
}

export function ParagraphGroup() {
  const target = useTextTarget()
  const format = target ? readTextFormat(target) : null
  const disabled = target === null
  // 図形内テキストには縦位置がない
  const vDisabled = disabled || format?.vAlign === undefined

  return (
    <RibbonGroup label="段落">
      <div className="ribbon-rows">
        <div className="ribbon-row">
          <SmallButton
            icon="alignLeft"
            ariaLabel="左揃え"
            disabled={disabled}
            active={format?.align === 'left'}
            onClick={() => target && act.setAlign(target, 'left')}
          />
          <SmallButton
            icon="alignCenter"
            ariaLabel="中央揃え"
            disabled={disabled}
            active={format?.align === 'center'}
            onClick={() => target && act.setAlign(target, 'center')}
          />
          <SmallButton
            icon="alignRight"
            ariaLabel="右揃え"
            disabled={disabled}
            active={format?.align === 'right'}
            onClick={() => target && act.setAlign(target, 'right')}
          />
        </div>
        <div className="ribbon-row">
          <SmallButton
            icon="alignTop"
            ariaLabel="上揃え"
            disabled={vDisabled}
            active={format?.vAlign === 'top'}
            onClick={() => target && act.setVAlign(target, 'top')}
          />
          <SmallButton
            icon="alignMiddle"
            ariaLabel="上下中央揃え"
            disabled={vDisabled}
            active={format?.vAlign === 'middle'}
            onClick={() => target && act.setVAlign(target, 'middle')}
          />
          <SmallButton
            icon="alignBottom"
            ariaLabel="下揃え"
            disabled={vDisabled}
            active={format?.vAlign === 'bottom'}
            onClick={() => target && act.setVAlign(target, 'bottom')}
          />
        </div>
      </div>
    </RibbonGroup>
  )
}
