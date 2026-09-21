/** リボン「デザイン」タブ。テーマのギャラリーと背景色。 */
import { resolveTheme, THEMES } from '@shared/themes'
import { useDeckStore } from '../../store/deckStore'
import { Icon } from '../Icon'
import { RibbonGroup, SmallButton } from './RibbonParts'

export function DesignTab() {
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const setThemeId = useDeckStore((state) => state.setThemeId)
  const background = useDeckStore((state) => state.deck.slides[state.slideIndex]?.background?.color)
  const setSlideBackground = useDeckStore((state) => state.setSlideBackground)
  const theme = resolveTheme(themeId, customTheme)

  return (
    <>
      <RibbonGroup label="テーマ">
        <div className="theme-gallery" role="radiogroup" aria-label="テーマ">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === themeId}
              aria-label={item.name}
              className={['theme-card', item.id === themeId ? 'is-active' : ''].join(' ').trim()}
              style={{ background: item.background }}
              onClick={() => setThemeId(item.id)}
            >
              <span
                className="theme-card-title"
                style={{ color: item.titleColor, fontFamily: item.titleFont }}
              >
                あ
              </span>
              <span className="theme-card-bar" style={{ background: item.accent }} />
              <span className="theme-card-name" style={{ color: item.bodyColor }}>
                {item.name}
              </span>
            </button>
          ))}
        </div>
      </RibbonGroup>

      <RibbonGroup label="背景">
        <div className="ribbon-rows">
          <label className="ribbon-color" title="このスライドの背景色">
            <span className="ribbon-color-bar is-wide" style={{ background: background ?? theme.background }} />
            <span>背景色</span>
            <input
              type="color"
              aria-label="背景色"
              value={background ?? theme.background}
              onChange={(event) => setSlideBackground(event.target.value)}
            />
          </label>
          <SmallButton
            icon="close"
            label="テーマの色に戻す"
            disabled={!background}
            onClick={() => setSlideBackground(null)}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="ユーザー設定">
        <div className="ribbon-info" title="スライドのサイズは 16:9 固定です">
          <Icon name="layout" size={28} />
          <span className="ribbon-big-label">
            スライドのサイズ
            <br />
            ワイド画面 (16:9)
          </span>
        </div>
      </RibbonGroup>
    </>
  )
}
