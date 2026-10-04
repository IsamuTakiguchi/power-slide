/**
 * 画面下のシート見出し。Excel のシート見出しと同じ操作にしている。
 *
 * - クリックで切り替え、ダブルクリックで名前の変更
 * - ドラッグで並べ替え
 * - 右クリック（タッチ操作では長押し）でメニュー:
 *   新しいシート・名前の変更・複製・左右へ移動・見出しの色・削除
 * - 右端の ＋ で新しいシートを足す
 */
import { useEffect, useRef, useState } from 'react'
import { MAX_SHEET_NAME_LENGTH } from '@shared/deck'
import { useDeckStore } from '../store/deckStore'
import { flashStatus } from '../store/uiStore'
import { deleteSheet } from '../lib/commands'
import { ContextMenu } from './ContextMenu'
import { Icon } from './Icon'

/** 見出しの色の候補（Excel の「標準の色」と同じ並び）。 */
const TAB_COLORS = [
  '#c00000',
  '#ff0000',
  '#ffc000',
  '#ffff00',
  '#92d050',
  '#00b050',
  '#00b0f0',
  '#0070c0',
  '#002060',
  '#7030a0',
]

/** これだけ押し続けたら長押しとみなしてメニューを出す（iPhone は右クリック相当が無いため）。 */
const LONG_PRESS_MS = 500

interface MenuState {
  index: number
  /** メニューを出す画面上の位置（PC のみ。狭い画面では下から出すシートになる）。 */
  x: number
  y: number
}

export function SheetTabs() {
  const sheets = useDeckStore((state) => state.deck.sheets)
  const active = useDeckStore((state) => state.deck.activeSheet)
  const selectSheet = useDeckStore((state) => state.selectSheet)
  const addSheet = useDeckStore((state) => state.addSheet)
  const moveSheet = useDeckStore((state) => state.moveSheet)

  const [renaming, setRenaming] = useState<number | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)

  // 開いているシートの見出しが、横スクロールの外に隠れないようにする
  useEffect(() => {
    const tab = listRef.current?.querySelector<HTMLElement>('.sheet-tab.is-active')
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active, sheets.length])

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }

  const openMenu = (index: number, x: number, y: number) => {
    cancelLongPress()
    setRenaming(null)
    setMenu({ index, x, y })
  }

  return (
    <div className="sheet-bar">
      <div className="sheet-tabs" role="tablist" aria-label="シート" ref={listRef}>
        {sheets.map((sheet, index) => {
          const isActive = index === active
          const isDropTarget = dropAt === index && dragFrom !== null && dragFrom !== index
          return (
            <div
              key={sheet.id}
              className={[
                'sheet-tab-wrap',
                isDropTarget ? (dragFrom! < index ? 'is-drop-after' : 'is-drop-before') : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={renaming !== index}
              onDragStart={(event) => {
                setDragFrom(index)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (dragFrom === null) return
                event.preventDefault()
                setDropAt(index)
              }}
              onDragEnd={() => {
                setDragFrom(null)
                setDropAt(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragFrom !== null && dragFrom !== index) moveSheet(dragFrom, index)
                setDragFrom(null)
                setDropAt(null)
              }}
            >
              {renaming === index ? (
                <RenameInput
                  index={index}
                  initial={sheet.name}
                  onDone={() => setRenaming(null)}
                />
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={`${sheet.name}（ダブルクリックで名前の変更、右クリックでメニュー）`}
                  className={['sheet-tab', isActive ? 'is-active' : '', sheet.color ? 'has-color' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={sheet.color ? { ['--sheet-color' as string]: sheet.color } : undefined}
                  onClick={() => selectSheet(index)}
                  onDoubleClick={() => {
                    selectSheet(index)
                    setRenaming(index)
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    selectSheet(index)
                    openMenu(index, event.clientX, event.clientY)
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse') return
                    const { clientX, clientY } = event
                    cancelLongPress()
                    longPressRef.current = {
                      timer: window.setTimeout(() => {
                        selectSheet(index)
                        openMenu(index, clientX, clientY)
                      }, LONG_PRESS_MS),
                      x: clientX,
                      y: clientY,
                    }
                  }}
                  onPointerMove={(event) => {
                    // 指が動いたら（横スクロールなど）長押しではない
                    const press = longPressRef.current
                    if (!press) return
                    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) {
                      cancelLongPress()
                    }
                  }}
                  onPointerUp={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {sheet.name}
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          className="sheet-add"
          aria-label="新しいシート"
          title="新しいシート（Shift+F11）"
          onClick={addSheet}
        >
          <Icon name="zoomIn" size={14} />
        </button>
      </div>

      {menu && (
        <SheetMenu
          menu={menu}
          onRename={() => setRenaming(menu.index)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/** 見出しの上に重ねる名前の入力欄。Enter で確定、Esc で取り消し。 */
function RenameInput({
  index,
  initial,
  onDone,
}: {
  index: number
  initial: string
  onDone: () => void
}) {
  const renameSheet = useDeckStore((state) => state.renameSheet)
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  /** Enter で確定した直後の blur で二重に確定しないようにする。 */
  const finishedRef = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  /** 確定する。名前が使えなければ理由を知らせ、keepOpen なら入力を続けさせる。 */
  const commit = (keepOpen: boolean) => {
    if (finishedRef.current) return
    const error = renameSheet(index, value)
    if (error) {
      flashStatus(error, 4000)
      if (keepOpen) return
    }
    finishedRef.current = true
    onDone()
  }

  return (
    <input
      ref={ref}
      className="sheet-rename"
      aria-label="シート名"
      value={value}
      maxLength={MAX_SHEET_NAME_LENGTH}
      size={Math.max(4, value.length + 1)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        // 編集画面のショートカット（Delete で要素削除など）に渡さない
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          commit(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          finishedRef.current = true
          onDone()
        }
      }}
      onBlur={() => commit(false)}
    />
  )
}

/** 見出しの右クリック（長押し）メニュー。 */
function SheetMenu({
  menu,
  onRename,
  onClose,
}: {
  menu: MenuState
  onRename: () => void
  onClose: () => void
}) {
  const sheets = useDeckStore((state) => state.deck.sheets)
  const selectSheet = useDeckStore((state) => state.selectSheet)
  const addSheet = useDeckStore((state) => state.addSheet)
  const duplicateSheet = useDeckStore((state) => state.duplicateSheet)
  const moveSheet = useDeckStore((state) => state.moveSheet)
  const setSheetColor = useDeckStore((state) => state.setSheetColor)
  const { index } = menu
  const sheet = sheets[index]

  if (!sheet) return null

  const run = (action: () => unknown) => () => {
    onClose()
    void action()
  }

  return (
    <ContextMenu point={menu} label={`シート「${sheet.name}」`} className="sheet-menu" onClose={onClose}>
      <div className="gallery-title">シート「{sheet.name}」</div>
      <button
        type="button"
        role="menuitem"
        onClick={run(() => {
          selectSheet(index)
          addSheet()
        })}
      >
        新しいシートを右に挿入
      </button>
      <button type="button" role="menuitem" onClick={run(onRename)}>
        名前の変更
      </button>
      <button type="button" role="menuitem" onClick={run(() => duplicateSheet(index))}>
        シートの複製
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={index === 0}
        onClick={run(() => moveSheet(index, index - 1))}
      >
        左へ移動
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={index === sheets.length - 1}
        onClick={run(() => moveSheet(index, index + 1))}
      >
        右へ移動
      </button>
      <div className="gallery-title">シート見出しの色</div>
      <div className="sheet-colors" role="group" aria-label="シート見出しの色">
        {TAB_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={['swatch', sheet.color === color ? 'is-active' : ''].filter(Boolean).join(' ')}
            style={{ background: color }}
            aria-label={`見出しの色 ${color}`}
            onClick={run(() => setSheetColor(index, color))}
          />
        ))}
        <button
          type="button"
          className="swatch is-none"
          aria-label="色なし"
          title="色なし"
          onClick={run(() => setSheetColor(index, null))}
        >
          /
        </button>
      </div>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        disabled={sheets.length <= 1}
        title={sheets.length <= 1 ? 'シートが 1 枚のときは削除できません' : undefined}
        onClick={run(() => deleteSheet(index))}
      >
        削除
      </button>
    </ContextMenu>
  )
}
