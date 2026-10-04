/**
 * リボン。タブの切り替えと、選んだタブの中身の表示。
 *
 * 選んでいるタブをもう一度押すか右端のボタンを押すと中身をたたむ（PowerPoint と同じ）。
 * スマホの横持ちのように画面が低いときに、スライドの表示を広げるために使う。
 */
import type { JSX } from 'react'
import { useUiStore, type RibbonTab } from '../store/uiStore'
import { useDeckStore } from '../store/deckStore'
import { selectTargetTable } from '../lib/tableCommands'
import { Icon } from './Icon'
import { useDropdown } from './ribbon/RibbonParts'
import { FileMenu } from './ribbon/FileMenu'
import { HomeTab } from './ribbon/HomeTab'
import { InsertTab } from './ribbon/InsertTab'
import { DesignTab } from './ribbon/DesignTab'
import { SlideShowTab } from './ribbon/SlideShowTab'
import { TableTab } from './ribbon/TableTab'

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'insert', label: '挿入' },
  { id: 'design', label: 'デザイン' },
  { id: 'slideshow', label: 'スライドショー' },
]

const PANELS: Record<RibbonTab, () => JSX.Element | null> = {
  home: HomeTab,
  insert: InsertTab,
  design: DesignTab,
  slideshow: SlideShowTab,
  table: TableTab,
}

export function Ribbon() {
  const selectedTab = useUiStore((state) => state.ribbonTab)
  const setTab = useUiStore((state) => state.setRibbonTab)
  // 「表」タブは表を選んでいるときだけ出す（Office のコンテキスト タブと同じ）
  const hasTable = useDeckStore((state) => selectTargetTable(state) !== null)
  const tab = selectedTab === 'table' && !hasTable ? 'home' : selectedTab
  const collapsed = useUiStore((state) => state.ribbonCollapsed)
  const toggleRibbon = useUiStore((state) => state.toggleRibbon)
  const fileMenu = useDropdown()
  const Panel = PANELS[tab]

  return (
    <div className={['ribbon', collapsed ? 'is-collapsed' : ''].join(' ').trim()}>
      <div className="ribbon-tabs" role="tablist">
        <div className="menu-anchor" ref={fileMenu.ref}>
          <button
            type="button"
            role="tab"
            className={['ribbon-tab', 'is-file', fileMenu.open ? 'is-open' : ''].join(' ').trim()}
            aria-selected={false}
            aria-expanded={fileMenu.open}
            onClick={fileMenu.toggle}
          >
            ファイル
          </button>
          {fileMenu.open && <FileMenu close={fileMenu.close} />}
        </div>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={['ribbon-tab', item.id === tab ? 'is-active' : ''].join(' ').trim()}
            aria-selected={item.id === tab}
            onClick={() => (item.id === tab ? toggleRibbon() : setTab(item.id))}
          >
            {item.label}
          </button>
        ))}
        {hasTable && (
          <button
            type="button"
            role="tab"
            className={['ribbon-tab', 'is-contextual', tab === 'table' ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-selected={tab === 'table'}
            onClick={() => (tab === 'table' ? toggleRibbon() : setTab('table'))}
          >
            表
          </button>
        )}
        <span className="ribbon-tabs-spacer" />
        <button
          type="button"
          className="ribbon-collapse"
          aria-label={collapsed ? 'リボンを表示' : 'リボンを折りたたむ'}
          aria-expanded={!collapsed}
          title={collapsed ? 'リボンを表示' : 'リボンを折りたたむ'}
          onClick={toggleRibbon}
        >
          <Icon name="chevronDown" size={16} />
        </button>
      </div>
      {!collapsed && (
        <div className="ribbon-body" role="tabpanel">
          <Panel />
        </div>
      )}
    </div>
  )
}
