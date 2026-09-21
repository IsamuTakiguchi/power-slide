/**
 * 編集画面の全体レイアウト。上からタイトルバー・リボン・本体（一覧／キャンバス／書式設定）・
 * ステータスバー。発表中は Presenter を全画面で重ねる。
 */
import { useEffect } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { useAutoSave } from '../hooks/useAutoSave'
import { useMenuCommands } from '../hooks/useMenuCommands'
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
import { useFileLaunch } from '../hooks/useFileLaunch'
import { TitleBar } from './TitleBar'
import { Ribbon } from './Ribbon'
import { SlideList } from './SlideList'
import { SlideCanvas } from './SlideCanvas'
import { Inspector } from './Inspector'
import { NotesPane } from './NotesPane'
import { StatusBar } from './StatusBar'
import { Presenter } from './Presenter'

export function AppShell() {
  const title = useDeckStore((state) => state.deck.title)
  const filePath = useDeckStore((state) => state.filePath)
  const dirty = useDeckStore((state) => state.dirty)
  const presenting = useUiStore((state) => state.presenting)
  const status = useUiStore((state) => state.status)

  useAutoSave()
  useMenuCommands()
  useEditorShortcuts()
  useFileLaunch()

  // ウィンドウタイトルにファイル名と未保存マークを出す
  useEffect(() => {
    const name = filePath ? filePath.split(/[\\/]/).pop() : '未保存'
    void window.api.window.setTitle(`${dirty ? '● ' : ''}${title} — ${name} — Power Slide`)
  }, [title, filePath, dirty])

  // 未保存の状態を main に伝える（ウィンドウを閉じるときの確認に使う）
  useEffect(() => {
    void window.api.window.setDirty(dirty)
  }, [dirty])

  return (
    <div className="app-shell">
      <TitleBar />
      <Ribbon />
      <div className="app-body">
        <SlideList />
        <main className="app-main">
          <SlideCanvas />
          <NotesPane />
        </main>
        <Inspector />
      </div>
      <StatusBar />
      {status && <div className="status-toast">{status}</div>}
      {presenting && <Presenter />}
    </div>
  )
}
