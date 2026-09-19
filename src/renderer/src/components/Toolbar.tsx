/** 上部ツールバー。挿入・テーマ・履歴・発表・書き出しの入口。 */
import { useState } from 'react'
import type { ShapeKind } from '@shared/deck'
import type { RecentFile } from '@shared/ipc'
import { LAYOUTS } from '@shared/layouts'
import { THEMES } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import {
  exportDeck,
  insertImage,
  insertShape,
  insertTextBox,
  newDeck,
  openDeck,
  openDeckPath,
  saveDeck,
  startPresenting,
} from '../lib/commands'

/** パスからファイル名だけを取り出す（Windows の区切りにも対応）。 */
function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

/** 「開く」の隣に出す、最近使ったファイルのメニュー。 */
function RecentMenu() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<RecentFile[] | null>(null)

  // 開くたびに読み直す（別ウィンドウや前回起動で増えている可能性があるため）
  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    void window.api.deck.recent().then(setFiles)
  }

  return (
    <div className="menu-anchor">
      <button type="button" title="最近使ったファイル" onClick={toggle}>
        履歴 ▾
      </button>
      {open && (
        <div className="dropdown is-left" onMouseLeave={() => setOpen(false)}>
          {files === null && <span className="dropdown-note">読み込み中…</span>}
          {files?.length === 0 && (
            <span className="dropdown-note">まだ履歴がありません</span>
          )}
          {files?.map((file) => (
            <button
              key={file.filePath}
              type="button"
              title={file.filePath}
              onClick={() => {
                setOpen(false)
                void openDeckPath(file.filePath)
              }}
            >
              <span className="recent-title">{file.title || fileName(file.filePath)}</span>
              <span className="recent-path">{fileName(file.filePath)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: '四角形' },
  { kind: 'roundRect', label: '角丸四角形' },
  { kind: 'ellipse', label: '円・楕円' },
  { kind: 'triangle', label: '三角形' },
  { kind: 'line', label: '直線' },
  { kind: 'arrow', label: '矢印' },
]

export function Toolbar() {
  const title = useDeckStore((state) => state.deck.title)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const autoSavePaused = useDeckStore((state) => state.autoSavePaused)
  const canUndo = useDeckStore((state) => state.past.length > 0)
  const canRedo = useDeckStore((state) => state.future.length > 0)

  const setTitle = useDeckStore((state) => state.setTitle)
  const setThemeId = useDeckStore((state) => state.setThemeId)
  const addSlide = useDeckStore((state) => state.addSlide)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)

  const [layoutId, setLayoutId] = useState('titleBody')
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const saveLabel = autoSavePaused
    ? '自動保存 停止中'
    : filePath
      ? dirty
        ? '未保存の変更あり'
        : '保存済み'
      : '未保存（保存先なし）'

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-group">
          <button type="button" onClick={() => void newDeck()}>
            新規
          </button>
          <button type="button" onClick={() => void openDeck()}>
            開く
          </button>
          <RecentMenu />
          <button type="button" onClick={() => void saveDeck()}>
            保存
          </button>
        </div>

        <div className="toolbar-group">
          <input
            type="text"
            className="deck-title"
            value={title}
            aria-label="プレゼンテーション名"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="toolbar-group toolbar-right">
          <span
            className={[
              'save-state',
              autoSavePaused ? 'is-paused' : dirty ? 'is-dirty' : 'is-clean',
            ].join(' ')}
            title={filePath ?? '保存先が決まっていません'}
          >
            {saveLabel}
          </span>
          <button type="button" className="is-primary" onClick={() => void startPresenting()}>
            スライドショー
          </button>
          <div className="menu-anchor">
            <button type="button" onClick={() => setExportMenuOpen((open) => !open)}>
              書き出し ▾
            </button>
            {exportMenuOpen && (
              <div className="dropdown" onMouseLeave={() => setExportMenuOpen(false)}>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    void exportDeck('pptx')
                  }}
                >
                  PowerPoint (.pptx)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    void exportDeck('pdf')
                  }}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false)
                    void exportDeck('png')
                  }}
                >
                  PNG 画像
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-group">
          <select
            aria-label="レイアウト"
            value={layoutId}
            onChange={(event) => setLayoutId(event.target.value)}
          >
            {LAYOUTS.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => addSlide(layoutId)}>
            スライドを追加
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" onClick={insertTextBox}>
            テキスト
          </button>
          <div className="menu-anchor">
            <button type="button" onClick={() => setShapeMenuOpen((open) => !open)}>
              図形 ▾
            </button>
            {shapeMenuOpen && (
              <div className="dropdown" onMouseLeave={() => setShapeMenuOpen(false)}>
                {SHAPES.map((shape) => (
                  <button
                    key={shape.kind}
                    type="button"
                    onClick={() => {
                      setShapeMenuOpen(false)
                      insertShape(shape.kind)
                    }}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => void insertImage()}>
            画像
          </button>
        </div>

        <div className="toolbar-group">
          <label className="field">
            テーマ
            <select
              aria-label="テーマ"
              value={themeId}
              onChange={(event) => setThemeId(event.target.value)}
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="toolbar-group toolbar-right">
          <button type="button" disabled={!canUndo} onClick={undo}>
            元に戻す
          </button>
          <button type="button" disabled={!canRedo} onClick={redo}>
            やり直す
          </button>
        </div>
      </div>
    </header>
  )
}
