/**
 * 最下段のステータスバー。スライド番号・テーマ・ノートの切り替え・スライドショー・ズーム。
 * 表の中にいるときは Excel と同じく、左端にセルの状態（準備完了／入力／編集）と番地、
 * 範囲を選んでいれば右側に平均・データの個数・合計を出す。
 */
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import { useUiStore, ZOOM_MAX, ZOOM_MIN } from '../store/uiStore'
import { startPresenting } from '../lib/commands'
import { selectTargetTable } from '../lib/tableCommands'
import { rangeAddress, rangeOf, summarizeRange } from '@shared/table'
import { Icon } from './Icon'
import { activeSlides } from '@shared/deck'

const ZOOM_STEP = 10

const CELL_MODE_LABEL = { ready: '準備完了', enter: '入力', edit: '編集' } as const

function formatNumber(value: number): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

export function StatusBar() {
  const slideIndex = useDeckStore((state) => state.slideIndex)
  const slideCount = useDeckStore((state) => activeSlides(state.deck).length)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const notesOpen = useUiStore((state) => state.notesOpen)
  const toggleNotes = useUiStore((state) => state.toggleNotes)
  const inspectorOpen = useUiStore((state) => state.inspectorOpen)
  const toggleInspector = useUiStore((state) => state.toggleInspector)
  const zoom = useUiStore((state) => state.zoom)
  const effectiveZoom = useUiStore((state) => state.effectiveZoom)
  const setZoom = useUiStore((state) => state.setZoom)
  const cellMode = useUiStore((state) => state.cellMode)
  const tableCursor = useDeckStore((state) => state.tableCursor)
  const cursorTable = useDeckStore((state) => (state.tableCursor ? selectTargetTable(state) : null))

  const theme = resolveTheme(themeId, customTheme)

  const range = tableCursor && cursorTable ? rangeOf(tableCursor.active, tableCursor.anchor) : null
  const multiCell = range !== null && (range.top !== range.bottom || range.left !== range.right)
  const summary = range && cursorTable && multiCell ? summarizeRange(cursorTable, range) : null

  return (
    <footer className="status-bar">
      {cellMode && range ? (
        <>
          <span className="status-item status-cell-mode">{CELL_MODE_LABEL[cellMode]}</span>
          <span className="status-item status-address" aria-label="選択中のセル">
            {rangeAddress(range)}
          </span>
        </>
      ) : (
        <span className="status-item">
          スライド {slideIndex + 1}/{slideCount}
        </span>
      )}
      <span className="status-item is-optional">日本語</span>
      <span className="status-item is-optional" title="テーマ">
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
      <button
        type="button"
        className={['status-button', inspectorOpen ? 'is-active' : ''].join(' ').trim()}
        aria-pressed={inspectorOpen}
        title="書式設定ウィンドウの表示を切り替え"
        onClick={toggleInspector}
      >
        <Icon name="layout" size={15} /> 書式
      </button>

      <span className="status-spacer" />

      {summary && summary.count > 0 && (
        <span className="status-item status-summary" aria-label="選択範囲の集計">
          {summary.average !== null && <span>平均: {formatNumber(summary.average)}</span>}
          <span>データの個数: {summary.count}</span>
          {summary.numericCount > 0 && <span>合計: {formatNumber(summary.sum)}</span>}
        </span>
      )}

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
