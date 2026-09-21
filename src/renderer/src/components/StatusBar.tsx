/** 最下段のステータスバー。スライド番号・テーマ・ノートの切り替え・スライドショー・ズーム。 */
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import { useUiStore, ZOOM_MAX, ZOOM_MIN } from '../store/uiStore'
import { startPresenting } from '../lib/commands'
import { Icon } from './Icon'

const ZOOM_STEP = 10

export function StatusBar() {
  const slideIndex = useDeckStore((state) => state.slideIndex)
  const slideCount = useDeckStore((state) => state.deck.slides.length)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const notesOpen = useUiStore((state) => state.notesOpen)
  const toggleNotes = useUiStore((state) => state.toggleNotes)
  const zoom = useUiStore((state) => state.zoom)
  const effectiveZoom = useUiStore((state) => state.effectiveZoom)
  const setZoom = useUiStore((state) => state.setZoom)

  const theme = resolveTheme(themeId, customTheme)

  return (
    <footer className="status-bar">
      <span className="status-item">
        スライド {slideIndex + 1}/{slideCount}
      </span>
      <span className="status-item">日本語</span>
      <span className="status-item" title="テーマ">
        {theme.name}
      </span>
      <button
        type="button"
        className={['status-button', notesOpen ? 'is-active' : ''].join(' ').trim()}
        aria-pressed={notesOpen}
        title="ノート欄の表示を切り替え"
        onClick={toggleNotes}
      >
        <Icon name="notes" size={15} /> ノート
      </button>

      <span className="status-spacer" />

      <button
        type="button"
        className="status-button"
        aria-label="スライドショー"
        title="現在のスライドからスライドショー（F5 で最初から）"
        onClick={() => void startPresenting()}
      >
        <Icon name="play" size={15} />
      </button>

      <div className="zoom-control">
        <button
          type="button"
          className="status-button"
          aria-label="縮小"
          onClick={() => setZoom(effectiveZoom - ZOOM_STEP)}
        >
          <Icon name="zoomOut" size={14} />
        </button>
        <input
          type="range"
          aria-label="ズーム"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={1}
          value={effectiveZoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
        <button
          type="button"
          className="status-button"
          aria-label="拡大"
          onClick={() => setZoom(effectiveZoom + ZOOM_STEP)}
        >
          <Icon name="zoomIn" size={14} />
        </button>
        <span className="zoom-value" title={zoom === null ? '画面に合わせて自動' : '手動'}>
          {effectiveZoom}%
        </span>
        <button
          type="button"
          className={['status-button', zoom === null ? 'is-active' : ''].join(' ').trim()}
          aria-label="画面に合わせる"
          title="スライドを画面に合わせる"
          onClick={() => setZoom(null)}
        >
          <Icon name="fitWindow" size={15} />
        </button>
      </div>
    </footer>
  )
}
