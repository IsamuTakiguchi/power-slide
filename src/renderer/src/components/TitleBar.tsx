/**
 * 最上段のタイトルバー。左にロゴ・自動保存のスイッチ・クイックアクセス（保存／元に戻す／やり直す）、
 * 中央にプレゼンテーション名、右に保存状態。
 */
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { autoSaveTarget, saveDeck, toggleAutoSave } from '../lib/commands'
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

  const autoSaveEnabled = useUiStore((state) => state.autoSaveEnabled)
  const target = autoSaveTarget(filePath)
  const autoSaveOn = autoSaveEnabled && target !== null
  const autoSaveText = autoSaveOn && autoSavePaused ? '停止中' : autoSaveOn ? 'オン' : 'オフ'
  const autoSaveHint = !autoSaveOn
    ? target === null
      ? '押すと保存先を選んで、自動保存をオンにします'
      : '押すと自動保存をオンにします'
    : autoSavePaused
      ? 'アプリの外でファイルが変更されたため止めています（オフ→オンで再開）'
      : target === 'file'
        ? '編集が止まると自動でファイルに保存します'
        : '編集中の内容をこのブラウザ内に自動で残します（ファイルにするには「保存」）'
  /** 外部変更で止めているか（スイッチがオフなら関係ない）。 */
  const paused = autoSaveOn && autoSavePaused

  const saveLabel = paused
    ? '自動保存 停止中'
    : filePath
      ? dirty
        ? '未保存の変更あり'
        : '保存済み'
      : '未保存（保存先なし）'

  // スマホでは横幅が足りないので短い言い方にする（CSS でどちらかだけを出す）
  const saveLabelShort = paused ? '停止中' : filePath && !dirty ? '保存済み' : '未保存'

  return (
    <header className="title-bar">
      <div className="title-bar-left">
        <span className="app-logo" aria-hidden="true">
          <Icon name="appLogo" size={22} />
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={autoSaveOn}
          aria-label="自動保存"
          className={[
            'autosave-switch',
            autoSaveOn ? 'is-on' : '',
            autoSaveOn && autoSavePaused ? 'is-paused' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={autoSaveHint}
          onClick={() => void toggleAutoSave()}
        >
          <span className="autosave-label">自動保存</span>
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="autosave-state">{autoSaveText}</span>
        </button>
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
          className={['save-state', paused ? 'is-paused' : dirty ? 'is-dirty' : 'is-clean'].join(' ')}
          title={filePath ?? '保存先が決まっていません'}
        >
          <span className="save-state-long">{saveLabel}</span>
          <span className="save-state-short">{saveLabelShort}</span>
        </span>
      </div>
    </header>
  )
}
