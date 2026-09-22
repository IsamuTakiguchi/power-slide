/**
 * 編集画面の全体レイアウト。上からタイトルバー・リボン・本体（一覧／キャンバス／書式設定）・
 * ステータスバー。発表中は Presenter を全画面で重ねる。
 *
 * 画面の広さで 3 段階に変わる（見た目の切り替えは styles.css 側）:
 *
 * - desktop（901px 以上）: PC のリボン UI そのまま
 * - tablet（601〜900px）: リボンは 1 行のボタン列、書式設定は下から出るシート
 * - phone（600px 以下）: さらにリボンとタブを画面下に移し、スライド一覧を下の帯にする
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

/** これより狭ければリボンを折りたたむ（タブレット縦持ちもこちらに入る）。 */
const COMPACT_QUERY = '(max-width: 900px)'
/** これより狭ければスマホ配置。 */
const PHONE_QUERY = '(max-width: 600px)'

function useResponsiveLayout(): void {
  const setLayout = useUiStore((state) => state.setLayout)
  useEffect(() => {
    const compactQuery = window.matchMedia(COMPACT_QUERY)
    const phoneQuery = window.matchMedia(PHONE_QUERY)
    const apply = () =>
      setLayout(phoneQuery.matches ? 'phone' : compactQuery.matches ? 'tablet' : 'desktop')
    apply()
    compactQuery.addEventListener('change', apply)
    phoneQuery.addEventListener('change', apply)
    return () => {
      compactQuery.removeEventListener('change', apply)
      phoneQuery.removeEventListener('change', apply)
    }
  }, [setLayout])
}

/**
 * スマホのソフトキーボードが出ている間は、その高さぶん画面を詰める。
 *
 * キーボードは表示領域（visualViewport）だけを縮めるので、そのままだと
 * ノート欄や下のリボンがキーボードの下に隠れてしまう。
 */
function useKeyboardInset(compact: boolean): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!compact || !viewport) return
    const root = document.documentElement
    const apply = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      // ブラウザ UI の出入りで数十 px 変わることがあるので、キーボードと言える大きさだけ拾う
      root.style.setProperty('--keyboard-inset', inset > 80 ? `${Math.round(inset)}px` : '0px')
    }
    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      root.style.removeProperty('--keyboard-inset')
    }
  }, [compact])
}

export function AppShell() {
  const title = useDeckStore((state) => state.deck.title)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const presenting = useUiStore((state) => state.presenting)
  const status = useUiStore((state) => state.status)
  const layout = useUiStore((state) => state.layout)
  const compact = useUiStore((state) => state.compact)
  const inspectorOpen = useUiStore((state) => state.inspectorOpen)
  const toggleInspector = useUiStore((state) => state.toggleInspector)

  useResponsiveLayout()
  useKeyboardInset(compact)
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
    <div
      className={['app-shell', compact ? 'is-compact' : '', layout === 'phone' ? 'is-phone' : '']
        .filter(Boolean)
        .join(' ')}
    >
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
