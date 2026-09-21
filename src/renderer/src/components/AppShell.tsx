/**
 * 編集画面の全体レイアウト。上からタイトルバー・リボン・本体（一覧／キャンバス／書式設定）・
 * ステータスバー。発表中は Presenter を全画面で重ねる。
 *
 * 幅が狭い（スマホ）ときはコンパクト配置に切り替える: リボンは横スクロール、
 * スライド一覧は下の帯、書式設定は下から出るシートになる。
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { useAutoSave } from '../hooks/useAutoSave'
import { useMenuCommands } from '../hooks/useMenuCommands'
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
import { useFileLaunch } from '../hooks/useFileLaunch'
import { platform } from '../platform'
import { TitleBar } from './TitleBar'
import { Ribbon } from './Ribbon'
import { SlideList } from './SlideList'
import { SlideCanvas } from './SlideCanvas'
import { Inspector } from './Inspector'
import { NotesPane } from './NotesPane'
import { StatusBar } from './StatusBar'
import { Presenter } from './Presenter'

/** これより狭ければコンパクト配置。タブレット縦持ちもこちらに入る。 */
const COMPACT_QUERY = '(max-width: 900px)'

function useCompactLayout(): void {
  const setCompact = useUiStore((state) => state.setCompact)
  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY)
    const apply = () => setCompact(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [setCompact])
}

export function AppShell() {
  const title = useDeckStore((state) => state.deck.title)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const presenting = useUiStore((state) => state.presenting)
  const status = useUiStore((state) => state.status)
  const compact = useUiStore((state) => state.compact)
  const inspectorOpen = useUiStore((state) => state.inspectorOpen)
  const toggleInspector = useUiStore((state) => state.toggleInspector)

  useCompactLayout()
  useAutoSave()
  useMenuCommands()
  useEditorShortcuts()
  useFileLaunch()

  // ウィンドウタイトルにファイル名と未保存マークを出す
  useEffect(() => {
    const name = filePath ? filePath.split(/[\\/]/).pop() : '未保存'
    void platform.window.setTitle(`${dirty ? '● ' : ''}${title} — ${name} — Power Slide`)
  }, [title, filePath, dirty])

  // 未保存の状態を伝える（ウィンドウを閉じるときの確認に使う）
  useEffect(() => {
    void platform.window.setDirty(dirty)
  }, [dirty])

  return (
    <div className={['app-shell', compact ? 'is-compact' : ''].join(' ').trim()}>
      <TitleBar />
      <Ribbon />
      <div className="app-body">
        <SlideList />
        <main className="app-main">
          <SlideCanvas />
          <NotesPane />
        </main>
        {compact && inspectorOpen && (
          <div className="sheet-backdrop" role="presentation" onClick={toggleInspector} />
        )}
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
      {status && <div className="status-toast">{status}</div>}
      {presenting && <Presenter />}
    </div>
  )
}
