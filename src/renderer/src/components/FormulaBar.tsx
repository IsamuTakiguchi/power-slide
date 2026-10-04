/**
 * 数式バー（Excel と同じ）。表の中にいるあいだ、キャンバスの上に出る。
 *
 * 左の名前ボックスに作業セルの番地（範囲なら B2:C3）、右の入力欄にセルの中身を出し、
 * ここでも編集できる。長い文字や、スライドが小さく表示されるスマホでの入力に向く。
 * スマホ・タブレットでは、小さなセルを押さなくても動けるように ◀▲▼▶ を並べる。
 *
 * Enter で確定して下へ、Tab で右へ（Shift で逆）、Esc で取り消し。Alt+Enter でセル内改行。
 */
import { useEffect, useRef, useState } from 'react'
import { rangeAddress, rangeOf, setCellText, type CellPos } from '@shared/table'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { selectTargetTable } from '../lib/tableCommands'
import { Icon } from './Icon'

const NAV_BUTTONS = [
  { label: '左のセル', dRow: 0, dCol: -1, rotate: 90 },
  { label: '上のセル', dRow: -1, dCol: 0, rotate: 180 },
  { label: '下のセル', dRow: 1, dCol: 0, rotate: 0 },
  { label: '右のセル', dRow: 0, dCol: 1, rotate: -90 },
] as const

/** 表の中のセルの入力欄（TableEditor）へ戻る。 */
function focusCellInput(): void {
  document.querySelector<HTMLTextAreaElement>('.table-cell-input')?.focus({ preventScroll: true })
}

export function FormulaBar() {
  const cursor = useDeckStore((state) => state.tableCursor)
  const table = useDeckStore((state) => (state.tableCursor ? selectTargetTable(state) : null))
  const compact = useUiStore((state) => state.compact)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraftState] = useState('')
  /** 入力欄の中身がどのセルのものか（確定する先）と、読み込んだときの中身。 */
  const cellRef = useRef<{ tableId: string; pos: CellPos; original: string } | null>(null)
  const draftRef = useRef('')
  const focusedRef = useRef(false)

  const setDraft = (text: string) => {
    draftRef.current = text
    setDraftState(text)
  }

  /** 入力欄の中身を、それが属するセルに確定する。 */
  const commit = () => {
    const cell = cellRef.current
    if (!cell || draftRef.current === cell.original) return
    const text = draftRef.current
    useDeckStore.getState().editTable(cell.tableId, (draftTable) => setCellText(draftTable, cell.pos, text))
    cell.original = text
  }

  const active = cursor?.active
  const cellText = table && active ? (table.rows[active.row]?.[active.col]?.text ?? '') : ''

  /** セルの中身を入力欄に読み込む。 */
  const load = (tableId: string, pos: CellPos, text: string) => {
    cellRef.current = { tableId, pos, original: text }
    setDraft(text)
  }

  // 作業セルがほかの操作（表のセルを押すなど）で変わったら、打ちかけの中身を前のセルに
  // 確定してから、新しいセルの中身を読む
  useEffect(() => {
    if (!table || !active) {
      cellRef.current = null
      return
    }
    const current = cellRef.current
    const samePos =
      current !== null &&
      current.tableId === table.id &&
      current.pos.row === active.row &&
      current.pos.col === active.col
    // 入力欄で打っている最中に同じセルなら触らない（move で読み込み済み・自分で確定しただけ）
    if (samePos && focusedRef.current) return
    if (focusedRef.current) commit()
    load(table.id, active, cellText)
    // commit は参照だけを使うので、セルの位置・中身・表が変わったときだけ動けばよい
  }, [table?.id, active?.row, active?.col, cellText])

  if (!cursor || !table || !active) return null

  const range = rangeOf(cursor.active, cursor.anchor)

  /** 作業セルを動かす。入力欄にいれば、次のセルの中身を選んだ状態にして続けて打てるようにする。 */
  const move = (dRow: number, dCol: number) => {
    commit()
    useDeckStore.getState().setTableCursor({ row: active.row + dRow, col: active.col + dCol })
    // 次のセルの中身はここですぐ読み込む（描画を待つと、続けて打った文字が前の中身に付いてしまう）
    const state = useDeckStore.getState()
    const target = selectTargetTable(state)
    const pos = state.tableCursor?.active
    if (target && pos) {
      load(target.id, pos, target.rows[pos.row]?.[pos.col]?.text ?? '')
      if (focusedRef.current) inputRef.current?.select()
    }
  }

  return (
    <div className="formula-bar" role="group" aria-label="数式バー">
      <span className="name-box" aria-label="名前ボックス" title="作業セルの番地">
        {rangeAddress(range)}
      </span>
      {compact && (
        <div className="formula-nav" role="group" aria-label="セルの移動">
          {NAV_BUTTONS.map(({ label, dRow, dCol, rotate }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              // 押しても入力欄からフォーカスを外さない（スマホのキーボードを閉じない）
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => move(dRow, dCol)}
            >
              <Icon name="chevronDown" size={16} style={{ transform: `rotate(${rotate}deg)` }} />
            </button>
          ))}
        </div>
      )}
      <span className="formula-fx" aria-hidden="true">
        fx
      </span>
      <textarea
        ref={inputRef}
        className="formula-input"
        aria-label="セルの内容"
        rows={1}
        spellCheck={false}
        value={draft}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          commit()
          focusedRef.current = false
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // 編集画面のショートカットには渡さない
          event.stopPropagation()
          if (event.nativeEvent.isComposing || event.keyCode === 229) return
          if (event.key === 'Enter' && event.altKey) {
            // セル内改行（Excel と同じ）
            event.preventDefault()
            const input = event.currentTarget
            const { selectionStart, selectionEnd } = input
            setDraft(`${draftRef.current.slice(0, selectionStart)}\n${draftRef.current.slice(selectionEnd)}`)
            requestAnimationFrame(() => input.setSelectionRange(selectionStart + 1, selectionStart + 1))
            return
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            if (event.key === 'Enter') move(event.shiftKey ? -1 : 1, 0)
            else move(0, event.shiftKey ? -1 : 1)
            // PC では Excel と同じく表に戻る。スマホ・タブレットは続けて打てるようバーに残る
            if (!compact) focusCellInput()
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            // 打った分は捨てて、表の操作に戻る
            setDraft(cellRef.current?.original ?? '')
            focusCellInput()
          }
        }}
      />
    </div>
  )
}
