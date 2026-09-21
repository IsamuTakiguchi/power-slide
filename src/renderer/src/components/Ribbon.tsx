/** リボン。タブの切り替えと、選んだタブの中身の表示。 */
import type { JSX } from 'react'
import { useUiStore, type RibbonTab } from '../store/uiStore'
import { useDropdown } from './ribbon/RibbonParts'
import { FileMenu } from './ribbon/FileMenu'
import { HomeTab } from './ribbon/HomeTab'
import { InsertTab } from './ribbon/InsertTab'
import { DesignTab } from './ribbon/DesignTab'
import { SlideShowTab } from './ribbon/SlideShowTab'

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'insert', label: '挿入' },
  { id: 'design', label: 'デザイン' },
  { id: 'slideshow', label: 'スライドショー' },
]

const PANELS: Record<RibbonTab, () => JSX.Element> = {
  home: HomeTab,
  insert: InsertTab,
  design: DesignTab,
  slideshow: SlideShowTab,
}

export function Ribbon() {
  const tab = useUiStore((state) => state.ribbonTab)
  const setTab = useUiStore((state) => state.setRibbonTab)
  const fileMenu = useDropdown()
  const Panel = PANELS[tab]

  return (
    <div className="ribbon">
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
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ribbon-body" role="tabpanel">
        <Panel />
      </div>
    </div>
  )
}
