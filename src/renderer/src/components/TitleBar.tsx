/**
 * 最上段のタイトルバー。左にロゴ・自動保存の状態・クイックアクセス（保存／元に戻す／やり直す）、
 * 中央にプレゼンテーション名、右に保存状態。
 */
import { useDeckStore } from '../store/deckStore'
import { saveDeck } from '../lib/commands'
import { platform } from '../platform'
import { Icon } from './Icon'

export function TitleBar() {
  const title = useDeckStore((state) => state.deck.title)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const autoSavePaused = useDeckStore((state) => state.autoSavePaused)
  const canUndo = useDeckStore((state) => state.past.length > 0)
  const canRedo = useDeckStore((state) => state.future.length > 0)
  const setTitle = useDeckStore((state) => state.setTitle)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)

  const saveLabel = autoSavePaused
    ? '自動保存 停止中'
    : filePath
      ? dirty
        ? '未保存の変更あり'
        : '保存済み'
      : '未保存（保存先なし）'

  // 保存先が決まっていれば自動保存が効く（ファイル外の変更を検知したときは止まる）。
  // Web 版は保存先が無くてもブラウザ内に下書きを残す
  const autoSaveState = autoSavePaused
    ? 'paused'
    : filePath
      ? 'on'
      : platform.capabilities.draftAutosave
        ? 'draft'
        : 'off'
  const autoSaveText = { on: 'オン', off: 'オフ', draft: '下書き', paused: '停止中' }[autoSaveState]
  const autoSaveHint = {
    on: '編集が止まると自動で保存します',
    off: '一度保存すると自動保存が有効になります',
    draft: '編集中の内容をこのブラウザ内に残します（ファイルには保存されません）',
    paused: 'アプリの外でファイルが変更されたため止めています',
  }[autoSaveState]

  return (
    <header className="title-bar">
      <div className="title-bar-left">
        <span className="app-logo" aria-hidden="true">
          <Icon name="appLogo" size={22} />
        </span>
        <span className={`autosave is-${autoSaveState}`} title={autoSaveHint}>
          <span className="autosave-dot" />
          自動保存 <b>{autoSaveText}</b>
        </span>
        <div className="qat" aria-label="クイックアクセス ツールバー">
          <button type="button" aria-label="保存" title="保存 (Ctrl+S)" onClick={() => void saveDeck()}>
            <Icon name="save" size={18} />
          </button>
          <button type="button" aria-label="元に戻す" title="元に戻す (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Icon name="undo" size={18} />
          </button>
          <button
            type="button"
            aria-label="やり直す"
            title="やり直す (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
          >
            <Icon name="redo" size={18} />
          </button>
        </div>
      </div>

      <div className="title-bar-center">
        <input
          type="text"
          className="deck-title"
          value={title}
          aria-label="プレゼンテーション名"
          onChange={(event) => setTitle(event.target.value)}
        />
        <span className="title-app-name">Power Slide</span>
      </div>

      <div className="title-bar-right">
        <span
          className={['save-state', autoSavePaused ? 'is-paused' : dirty ? 'is-dirty' : 'is-clean'].join(' ')}
          title={filePath ?? '保存先が決まっていません'}
        >
          {saveLabel}
        </span>
      </div>
    </header>
  )
}
