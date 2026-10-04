/**
 * 表の中の操作（Excel と同じセル操作）。表の中にいるあいだ、SlideCanvas が表の上に重ねる。
 *
 * - クリックでセルを選び、ドラッグか Shift＋クリック・Shift＋矢印で範囲を広げる
 * - 矢印・Tab・Enter で移動（Shift で逆向き、Ctrl＋矢印で端まで）。最後のセルで Tab を押すと行が増える
 * - そのまま打てば上書き（入力）、F2 かダブルクリックで今の文字に続けて編集
 * - Alt+Enter でセル内改行、Esc で取り消し、Delete で範囲の文字を消す
 * - 列の境目をドラッグして列幅を変える
 * - 右クリック（長押し）で行・列の挿入と削除などのメニュー
 * - Ctrl+C / Ctrl+X / Ctrl+V は Excel とタブ区切りでやりとりできる
 *
 * 日本語入力のため、作業セルの上に透明な textarea を常にフォーカスしておく。
 * 1 打目から IME の変換を始められるのはこのため（keydown を拾う方式では変換が始まらない）。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TableElement, Theme } from '@shared/deck'
import {
  cellAt,
  cellStyle,
  columnWidthsPx,
  insertRows,
  parseTsv,
  rangeAddress,
  rangeOf,
  setCellText,
  tableColors,
  type CellPos,
  type CellRange,
} from '@shared/table'
import { useDeckStore, type TableCursor } from '../store/deckStore'
import { useUiStore, type CellMode } from '../store/uiStore'
import { saveDeck } from '../lib/commands'
import { gridFromClipboard } from '../lib/clipboard'
import {
  alignTableCells,
  clearTableCells,
  pasteGridIntoTable,
  tableSelectionToClipboard,
  deleteTableCols,
  deleteTableRows,
  formatTableCells,
  insertTableCols,
  insertTableRows,
  toggleTableBold,
} from '../lib/tableCommands'
import { TABLE_CELL_PADDING_X } from './elements/TableElementView'
import { ContextMenu, type MenuPoint } from './ContextMenu'

/** 長押しでメニューを出すまでの時間（iPhone には右クリック相当が無いため）。 */
const LONG_PRESS_MS = 500
/** 列幅の下限（論理 px）。 */
const MIN_COLUMN_PX = 24
/** セルの中の行の高さ（TableElementView の line-height と同じ）。 */
const CELL_LINE_HEIGHT = 1.3

/** 指で操作する端末か。準備完了の状態ではソフトキーボードを出さないために使う。 */
const coarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true

function inRange(range: CellRange, pos: CellPos): boolean {
  return pos.row >= range.top && pos.row <= range.bottom && pos.col >= range.left && pos.col <= range.right
}

export function TableEditor({
  table,
  cursor,
  scale,
  theme,
}: {
  table: TableElement
  cursor: TableCursor
  scale: number
  theme: Theme
}) {
  const setTableCursor = useDeckStore((state) => state.setTableCursor)
  const setTableRange = useDeckStore((state) => state.setTableRange)
  const exitTable = useDeckStore((state) => state.exitTable)
  const editTable = useDeckStore((state) => state.editTable)
  const pushHistory = useDeckStore((state) => state.pushHistory)
  const endTransaction = useDeckStore((state) => state.endTransaction)
  const setCellMode = useUiStore((state) => state.setCellMode)

  const [mode, setModeState] = useState<CellMode>('ready')
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const modeRef = useRef<CellMode>('ready')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** 編集を始めたときのセルと中身（確定・取り消しに使う）。 */
  const editRef = useRef<{ pos: CellPos; original: string }>({ pos: cursor.active, original: '' })
  const dragRef = useRef<{ anchor: CellPos; moved: boolean; startX: number; startY: number } | null>(null)
  const resizeRef = useRef<{ index: number; startX: number; widths: number[] } | null>(null)
  const longPressRef = useRef<number | null>(null)
  /** タップ前から作業セルだったか（指でもう一度タップしたら編集に入るため）。 */
  const tapOnActiveRef = useRef(false)

  // 最新の値をイベントの中から読むための参照
  const tableRef = useRef(table)
  const cursorRef = useRef(cursor)
  tableRef.current = table
  cursorRef.current = cursor

  const setMode = useCallback(
    (next: CellMode) => {
      modeRef.current = next
      setModeState(next)
      setCellMode(next)
    },
    [setCellMode],
  )

  useEffect(() => {
    setCellMode('ready')
    return () => setCellMode(null)
  }, [setCellMode])

  // ---------------------------------------------------------------- 位置

  const rows = table.rows.length
  const widths = columnWidthsPx(table).map((width) => width * scale)
  const lefts = widths.map((_, index) => widths.slice(0, index).reduce((sum, width) => sum + width, 0))
  const rowHeight = (table.h * scale) / rows

  const rectOf = (range: CellRange): CSSProperties => ({
    left: lefts[range.left],
    top: range.top * rowHeight,
    width: lefts[range.right] + widths[range.right] - lefts[range.left],
    height: (range.bottom - range.top + 1) * rowHeight,
  })

  const posFromClient = (clientX: number, clientY: number): CellPos => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return cursorRef.current.active
    return cellAt(tableRef.current, (clientX - box.left) / scale, (clientY - box.top) / scale)
  }

  const range = rangeOf(cursor.active, cursor.anchor)

  // ---------------------------------------------------------------- 入力欄

  const focusInput = useCallback(() => {
    const input = inputRef.current
    if (!input) return
    const focused = document.activeElement
    // ほかの入力欄（リボンの文字サイズ・書式設定など）を触っているときは奪わない
    if (
      focused &&
      focused !== input &&
      (focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement ||
        focused instanceof HTMLSelectElement ||
        (focused instanceof HTMLElement && focused.isContentEditable))
    ) {
      return
    }
    // 指で操作する端末では、セルを選んでいるだけのあいだはキーボードを出さない
    input.inputMode = coarsePointer() && modeRef.current === 'ready' ? 'none' : 'text'
    input.focus({ preventScroll: true })
  }, [])

  /** 入力中・編集中の文字をセルに確定する。 */
  const commit = useCallback(() => {
    const input = inputRef.current
    if (modeRef.current === 'ready' || !input) return
    const text = input.value
    const { pos, original } = editRef.current
    if (text !== original) {
      editTable(tableRef.current.id, (current) => setCellText(current, pos, text))
    }
    input.value = ''
    setMode('ready')
  }, [editTable, setMode])

  const cancel = useCallback(() => {
    const input = inputRef.current
    if (input) input.value = ''
    setMode('ready')
  }, [setMode])

  /** 今の文字に続けて編集する（F2・ダブルクリック）。 */
  const startEdit = useCallback(
    (pos: CellPos = cursorRef.current.active) => {
      const input = inputRef.current
      if (!input) return
      const text = tableRef.current.rows[pos.row]?.[pos.col]?.text ?? ''
      input.inputMode = 'text'
      // 指の操作では、いったん外してから当て直すとソフトキーボードが出る。
      // 外すのは「編集」に切り替える前にする（編集中に外れると、その場で確定してしまうため）
      if (coarsePointer()) input.blur()
      editRef.current = { pos, original: text }
      input.value = text
      setMode('edit')
      input.focus({ preventScroll: true })
      input.setSelectionRange(text.length, text.length)
    },
    [setMode],
  )

  /** そのまま打ち始めた（上書きの入力）。 */
  const beginEnter = () => {
    if (modeRef.current !== 'ready') return
    const pos = cursorRef.current.active
    editRef.current = { pos, original: tableRef.current.rows[pos.row]?.[pos.col]?.text ?? '' }
    setMode('enter')
  }

  // 作業セルが変わったら（前の入力は確定して）入力欄を当て直す
  useEffect(() => {
    focusInput()
  }, [cursor.active.row, cursor.active.col, cursor.anchor.row, cursor.anchor.col, table, focusInput])

  // ダブルクリック・F2 などで「編集して」と頼まれたら編集に入る
  useEffect(() => {
    // editRequest が増えたときだけ動けばよい（作業セルは参照から読む）
    if (cursor.editRequest > 0) startEdit(cursorRef.current.active)
  }, [cursor.editRequest, startEdit])

  // 表から出るとき（別の要素を選んだ・Esc など）、入力途中の文字は確定しておく
  useEffect(() => () => commit(), [commit])

  // ---------------------------------------------------------------- 移動

  const move = (dRow: number, dCol: number, extend = false) => {
    const { active } = cursorRef.current
    setTableCursor({ row: active.row + dRow, col: active.col + dCol }, extend)
  }

  /** Ctrl＋矢印: 表の端まで移動する。 */
  const jump = (dRow: number, dCol: number, extend = false) => {
    const { active } = cursorRef.current
    const current = tableRef.current
    const lastRow = current.rows.length - 1
    const lastCol = (current.rows[0]?.length ?? 1) - 1
    setTableCursor(
      {
        row: dRow < 0 ? 0 : dRow > 0 ? lastRow : active.row,
        col: dCol < 0 ? 0 : dCol > 0 ? lastCol : active.col,
      },
      extend,
    )
  }

  /** Tab: 右へ。行の端なら次の行の先頭へ。最後のセルなら行を足して移る（PowerPoint・Word の表と同じ）。 */
  const moveTab = (back: boolean) => {
    const current = tableRef.current
    const cols = current.rows[0]?.length ?? 1
    const total = current.rows.length
    let { row, col } = cursorRef.current.active
    if (back) {
      if (col > 0) col -= 1
      else if (row > 0) {
        row -= 1
        col = cols - 1
      }
    } else if (col < cols - 1) {
      col += 1
    } else if (row < total - 1) {
      row += 1
      col = 0
    } else {
      editTable(current.id, (draft) => insertRows(draft, total, 1))
      row = total
      col = 0
    }
    setTableCursor({ row, col })
  }

  // ---------------------------------------------------------------- キー操作

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 編集画面のショートカット（Delete で要素削除など）には渡さない
    event.stopPropagation()
    // 日本語入力の変換中は IME に任せる（Enter は変換の確定）
    if (event.nativeEvent.isComposing || event.keyCode === 229) return

    const meta = event.ctrlKey || event.metaKey
    const key = event.key
    const current = modeRef.current
    const store = useDeckStore.getState()

    if (meta && key.toLowerCase() === 's') {
      event.preventDefault()
      commit()
      void saveDeck()
      return
    }
    if (key === 'Enter' && event.altKey) {
      // Excel と同じくセル内で改行する
      event.preventDefault()
      if (current === 'ready') startEdit()
      const input = inputRef.current
      if (input) {
        const { selectionStart, selectionEnd, value } = input
        input.value = `${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`
        input.setSelectionRange(selectionStart + 1, selectionStart + 1)
      }
      return
    }
    if (key === 'Escape') {
      event.preventDefault()
      if (current === 'ready') exitTable()
      else cancel()
      return
    }
    if (key === 'Tab') {
      event.preventDefault()
      commit()
      moveTab(event.shiftKey)
      return
    }
    if (key === 'Enter') {
      event.preventDefault()
      commit()
      move(event.shiftKey ? -1 : 1, 0)
      return
    }

    const arrows: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }

    // 編集（F2）中は、矢印は文字の中のカーソル移動に使う
    if (current === 'edit') return
    if (current === 'enter') {
      // 入力（上書き）中の矢印は、確定して隣のセルへ（Excel と同じ）
      const arrow = arrows[key]
      if (arrow) {
        event.preventDefault()
        commit()
        move(arrow[0], arrow[1])
      }
      return
    }

    // ここから準備完了（セルを選んでいるだけ）の状態
    const arrow = arrows[key]
    if (arrow) {
      event.preventDefault()
      if (meta) jump(arrow[0], arrow[1], event.shiftKey)
      else move(arrow[0], arrow[1], event.shiftKey)
      return
    }
    switch (key) {
      case 'Home':
        event.preventDefault()
        setTableCursor({ row: meta ? 0 : cursorRef.current.active.row, col: 0 }, event.shiftKey)
        return
      case 'End': {
        event.preventDefault()
        const lastCol = (tableRef.current.rows[0]?.length ?? 1) - 1
        const lastRow = tableRef.current.rows.length - 1
        setTableCursor(
          { row: meta ? lastRow : cursorRef.current.active.row, col: lastCol },
          event.shiftKey,
        )
        return
      }
      case 'F2':
        event.preventDefault()
        startEdit()
        return
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        clearTableCells()
        return
      default:
        break
    }
    if (meta) {
      switch (key.toLowerCase()) {
        case 'z':
          event.preventDefault()
          if (event.shiftKey) store.redo()
          else store.undo()
          return
        case 'y':
          event.preventDefault()
          store.redo()
          return
        case 'a': {
          event.preventDefault()
          const lastRow = tableRef.current.rows.length - 1
          const lastCol = (tableRef.current.rows[0]?.length ?? 1) - 1
          setTableRange({ row: 0, col: 0 }, { row: lastRow, col: lastCol })
          return
        }
        case 'b':
          event.preventDefault()
          toggleTableBold()
          return
        default:
          return
      }
    }
    // それ以外の文字はそのまま入力欄に入り、onInput で「入力」に切り替わる
  }

  // ---------------------------------------------------------------- コピー・貼り付け（Excel とタブ区切りでやりとり）

  const currentRange = () => rangeOf(cursorRef.current.active, cursorRef.current.anchor)

  const onCopy = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 入力・編集中はふつうの文字のコピー
    if (modeRef.current !== 'ready') return
    const data = tableSelectionToClipboard()
    if (!data) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', data.text)
    event.clipboardData.setData('text/html', data.html)
  }

  const onCut = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (modeRef.current !== 'ready') return
    onCopy(event)
    clearTableCells()
  }

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // 入力・編集中はふつうの文字の貼り付け
    if (modeRef.current !== 'ready') return
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    const html = event.clipboardData.getData('text/html')
    // タブを含まない文字は、行ごとに縦へ並べて貼る（Excel と同じ）
    const grid = gridFromClipboard(text, html) ?? (text ? parseTsv(text) : null)
    if (grid) pasteGridIntoTable(grid)
  }

  // ---------------------------------------------------------------- 指・マウス

  const cancelLongPress = () => {
    if (longPressRef.current !== null) window.clearTimeout(longPressRef.current)
    longPressRef.current = null
  }

  const openMenuAt = (clientX: number, clientY: number) => {
    cancelLongPress()
    dragRef.current = null
    commit()
    const pos = posFromClient(clientX, clientY)
    // 範囲の外を押したときは、そのセルを選び直してからメニューを出す（Excel と同じ）
    if (!inRange(currentRange(), pos)) setTableCursor(pos)
    setMenu({ x: clientX, y: clientY })
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.stopPropagation()
    commit()
    const pos = posFromClient(event.clientX, event.clientY)
    const { active, anchor } = cursorRef.current
    const single = active.row === anchor.row && active.col === anchor.col
    tapOnActiveRef.current = single && active.row === pos.row && active.col === pos.col
    if (event.shiftKey) setTableCursor(pos, true)
    else setTableCursor(pos)
    dragRef.current = {
      anchor: event.shiftKey ? anchor : pos,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (event.pointerType !== 'mouse') {
      const { clientX, clientY } = event
      cancelLongPress()
      longPressRef.current = window.setTimeout(() => openMenuAt(clientX, clientY), LONG_PRESS_MS)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
      drag.moved = true
      cancelLongPress()
    }
    if (!drag.moved) return
    setTableRange(drag.anchor, posFromClient(event.clientX, event.clientY))
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const longPressPending = longPressRef.current !== null
    cancelLongPress()
    dragRef.current = null
    // 指で、作業セルをもう一度タップしたら編集に入る（ダブルタップが効かない端末のため）
    if (event.pointerType !== 'mouse' && drag && !drag.moved && longPressPending && tapOnActiveRef.current) {
      startEdit()
    } else {
      focusInput()
    }
  }

  // ---------------------------------------------------------------- 列幅のドラッグ

  const onResizeDown = (index: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    commit()
    pushHistory()
    resizeRef.current = { index, startX: event.clientX, widths: columnWidthsPx(tableRef.current) }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current
    if (!resize) return
    const { index, widths: start } = resize
    const pair = start[index] + start[index + 1]
    const left = Math.min(pair - MIN_COLUMN_PX, Math.max(MIN_COLUMN_PX, start[index] + (event.clientX - resize.startX) / scale))
    editTable(
      tableRef.current.id,
      (draft) => {
        draft.colWidths = start.map((width, k) => (k === index ? left : k === index + 1 ? pair - left : width))
      },
      true,
    )
  }

  const onResizeUp = () => {
    if (!resizeRef.current) return
    resizeRef.current = null
    endTransaction()
    focusInput()
  }

  // ---------------------------------------------------------------- 描画

  const colors = tableColors(table, theme)
  const activeStyle = cellStyle(table, cursor.active.row, cursor.active.col, colors)
  const activeRect = rectOf(rangeOf(cursor.active, cursor.active))
  const multi = range.top !== range.bottom || range.left !== range.right
  const editing = mode !== 'ready'
  const fontSize = table.fontSize * scale
  const lineHeightPx = fontSize * CELL_LINE_HEIGHT

  return (
    <div
      ref={boxRef}
      className="table-editor"
      style={{ left: table.x * scale, top: table.y * scale, width: table.w * scale, height: table.h * scale }}
      // クリックで入力欄からフォーカスが外れないようにする
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        cancelLongPress()
        dragRef.current = null
      }}
      onDoubleClick={(event) => {
        event.stopPropagation()
        const pos = posFromClient(event.clientX, event.clientY)
        setTableCursor(pos)
        startEdit(pos)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        openMenuAt(event.clientX, event.clientY)
      }}
    >
      {multi && <div className="table-range" style={rectOf(range)} />}
      <div className="table-active-cell" style={activeRect} />

      {widths.slice(0, -1).map((_, index) => (
        <div
          key={index}
          className="table-col-resizer"
          title="ドラッグで列の幅を変える"
          style={{ left: lefts[index + 1] - 4 }}
          onPointerDown={(event) => onResizeDown(index, event)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />
      ))}

      <textarea
        ref={inputRef}
        className={['table-cell-input', editing ? 'is-editing' : ''].filter(Boolean).join(' ')}
        aria-label={`セル ${rangeAddress(rangeOf(cursor.active, cursor.active))}`}
        spellCheck={false}
        autoComplete="off"
        style={{
          ...activeRect,
          fontFamily: table.fontFamily || theme.bodyFont,
          fontSize,
          lineHeight: CELL_LINE_HEIGHT,
          fontWeight: activeStyle.bold ? 700 : 400,
          textAlign: activeStyle.align,
          color: activeStyle.color,
          background: editing ? activeStyle.fill : 'transparent',
          padding: `${Math.max(0, (rowHeight - lineHeightPx) / 2 - 2)}px ${TABLE_CELL_PADDING_X * scale}px 0`,
        }}
        onKeyDown={onKeyDown}
        onInput={beginEnter}
        onCompositionStart={beginEnter}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onBlur={() => {
          // 別の場所を押して入力欄から離れたら、入力中の文字は確定する
          if (modeRef.current !== 'ready') commit()
        }}
        onPointerDown={(event) => event.stopPropagation()}
      />

      {menu && (
        <TableCellMenu
          point={menu}
          address={rangeAddress(range)}
          palette={theme.palette}
          onClose={() => {
            setMenu(null)
            focusInput()
          }}
        />
      )}
    </div>
  )
}

/** セルの右クリック（長押し）メニュー。 */
function TableCellMenu({
  point,
  address,
  palette,
  onClose,
}: {
  point: MenuPoint
  address: string
  palette: string[]
  onClose: () => void
}) {
  const run = (action: () => unknown) => () => {
    onClose()
    void action()
  }
  return (
    <ContextMenu point={point} label={`セル ${address}`} className="table-menu" onClose={onClose}>
      <div className="gallery-title">セル {address}</div>
      <button type="button" role="menuitem" onClick={run(() => insertTableRows('above'))}>
        上に行を挿入
      </button>
      <button type="button" role="menuitem" onClick={run(() => insertTableRows('below'))}>
        下に行を挿入
      </button>
      <button type="button" role="menuitem" onClick={run(() => insertTableCols('left'))}>
        左に列を挿入
      </button>
      <button type="button" role="menuitem" onClick={run(() => insertTableCols('right'))}>
        右に列を挿入
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={run(deleteTableRows)}>
        行を削除
      </button>
      <button type="button" role="menuitem" onClick={run(deleteTableCols)}>
        列を削除
      </button>
      <button type="button" role="menuitem" onClick={run(clearTableCells)}>
        内容をクリア
      </button>
      <div className="context-menu-separator" />
      <button type="button" role="menuitem" onClick={run(toggleTableBold)}>
        太字
      </button>
      <div className="table-menu-row" role="group" aria-label="文字の配置">
        <button type="button" role="menuitem" onClick={run(() => alignTableCells('left'))}>
          左揃え
        </button>
        <button type="button" role="menuitem" onClick={run(() => alignTableCells('center'))}>
          中央揃え
        </button>
        <button type="button" role="menuitem" onClick={run(() => alignTableCells('right'))}>
          右揃え
        </button>
      </div>
      <div className="gallery-title">セルの塗りつぶし</div>
      <div className="sheet-colors" role="group" aria-label="セルの塗りつぶし">
        {palette.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`塗りつぶし ${color}`}
            onClick={run(() => formatTableCells({ fill: color }))}
          />
        ))}
        <button
          type="button"
          className="swatch is-none"
          aria-label="塗りつぶしなし"
          title="塗りつぶしなし"
          onClick={run(() => formatTableCells({ fill: null }))}
        >
          /
        </button>
      </div>
    </ContextMenu>
  )
}
