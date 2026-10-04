/**
 * リボン「表」タブ。表を選んでいるときだけ出る（PowerPoint の「テーブル デザイン／レイアウト」に当たる）。
 * 表の中にいれば選んでいる範囲、表だけを選んでいれば表全体が対象になる。
 */
import { resolveTheme } from '@shared/themes'
import { cellStyle, fullRange, rangeOf, tableColors } from '@shared/table'
import { useDeckStore } from '../../store/deckStore'
import {
  alignTableCells,
  clearTableCells,
  deleteTableCols,
  deleteTableRows,
  formatTableCells,
  insertTableCols,
  insertTableRows,
  selectTargetTable,
  setTableOption,
  setTableStyle,
  toggleTableBold,
} from '../../lib/tableCommands'
import { Icon } from '../Icon'
import { RibbonGroup, SmallButton, SmallStack } from './RibbonParts'

export function TableTab() {
  const table = useDeckStore(selectTargetTable)
  const cursor = useDeckStore((state) => state.tableCursor)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  if (!table) return null

  const theme = resolveTheme(themeId, customTheme)
  const inside = cursor?.elementId === table.id
  const range = inside && cursor ? rangeOf(cursor.active, cursor.anchor) : fullRange(table)
  const lead = cellStyle(table, range.top, range.left, tableColors(table, theme))
  const leadCell = table.rows[range.top]?.[range.left]
  const rangeHint = inside ? '選んでいるセル' : '表全体'

  return (
    <>
      <RibbonGroup label="表スタイルのオプション">
        <SmallStack>
          <SmallButton
            icon={table.headerRow ? 'check' : 'table'}
            label="見出し行"
            active={table.headerRow}
            onClick={() => setTableOption('headerRow', !table.headerRow)}
          />
          <SmallButton
            icon={table.bandedRows ? 'check' : 'table'}
            label="縞模様（行）"
            active={table.bandedRows}
            onClick={() => setTableOption('bandedRows', !table.bandedRows)}
          />
          <SmallButton
            icon={table.firstColumn ? 'check' : 'table'}
            label="最初の列"
            active={table.firstColumn}
            onClick={() => setTableOption('firstColumn', !table.firstColumn)}
          />
        </SmallStack>
      </RibbonGroup>

      <RibbonGroup label="行と列">
        <SmallStack>
          <SmallButton icon="rowAbove" label="上に行を挿入" onClick={() => insertTableRows('above')} />
          <SmallButton icon="rowBelow" label="下に行を挿入" onClick={() => insertTableRows('below')} />
        </SmallStack>
        <SmallStack>
          <SmallButton icon="colLeft" label="左に列を挿入" onClick={() => insertTableCols('left')} />
          <SmallButton icon="colRight" label="右に列を挿入" onClick={() => insertTableCols('right')} />
        </SmallStack>
        <SmallStack>
          <SmallButton
            icon="rowDelete"
            label="行を削除"
            disabled={!inside}
            title={inside ? undefined : 'セルを選ぶと使えます'}
            onClick={deleteTableRows}
          />
          <SmallButton
            icon="colDelete"
            label="列を削除"
            disabled={!inside}
            title={inside ? undefined : 'セルを選ぶと使えます'}
            onClick={deleteTableCols}
          />
        </SmallStack>
      </RibbonGroup>

      <RibbonGroup label="セル">
        <div className="ribbon-rows">
          <div className="ribbon-row">
            <SmallButton
              icon="bold"
              ariaLabel="セルを太字"
              title={`太字（${rangeHint}・Ctrl+B）`}
              active={lead.bold}
              onClick={toggleTableBold}
            />
            <SmallButton
              icon="alignLeft"
              ariaLabel="セルを左揃え"
              active={lead.align === 'left'}
              onClick={() => alignTableCells('left')}
            />
            <SmallButton
              icon="alignCenter"
              ariaLabel="セルを中央揃え"
              active={lead.align === 'center'}
              onClick={() => alignTableCells('center')}
            />
            <SmallButton
              icon="alignRight"
              ariaLabel="セルを右揃え"
              active={lead.align === 'right'}
              onClick={() => alignTableCells('right')}
            />
          </div>
          <div className="ribbon-row">
            <label className="ribbon-color" title={`塗りつぶし（${rangeHint}）`}>
              <Icon name="fill" size={18} />
              <span className="ribbon-color-bar" style={{ background: leadCell?.fill ?? 'transparent' }} />
              <input
                type="color"
                aria-label="セルの塗りつぶし"
                value={leadCell?.fill ?? '#ffffff'}
                onChange={(event) => formatTableCells({ fill: event.target.value })}
              />
            </label>
            <label className="ribbon-color" title={`文字の色（${rangeHint}）`}>
              <Icon name="fontColor" size={18} />
              <span className="ribbon-color-bar" style={{ background: lead.color }} />
              <input
                type="color"
                aria-label="セルの文字の色"
                value={/^#[0-9a-f]{6}$/i.test(lead.color) ? lead.color : '#000000'}
                onChange={(event) => formatTableCells({ color: event.target.value })}
              />
            </label>
            <SmallButton
              icon="close"
              ariaLabel="セルの色を既定に戻す"
              onClick={() => formatTableCells({ fill: null, color: null, bold: null, align: null })}
            />
            <SmallButton icon="eraser" label="クリア" title={`文字を消す（${rangeHint}）`} onClick={clearTableCells} />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="表">
        <div className="ribbon-rows">
          <label className="ribbon-row ribbon-field" title="表の文字の大きさ（pt ではなく論理 px）">
            <span>文字サイズ</span>
            <input
              type="number"
              className="font-size"
              aria-label="表の文字サイズ"
              min={8}
              max={96}
              value={table.fontSize}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (Number.isFinite(value) && value >= 8) setTableStyle({ fontSize: Math.min(96, value) })
              }}
            />
          </label>
          <label className="ribbon-color" title="見出し行の色">
            <Icon name="table" size={18} />
            <span className="ribbon-color-bar" style={{ background: table.headerFill || theme.accent }} />
            <span>見出しの色</span>
            <input
              type="color"
              aria-label="見出し行の色"
              value={table.headerFill || theme.accent}
              onChange={(event) => setTableStyle({ headerFill: event.target.value })}
            />
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}
