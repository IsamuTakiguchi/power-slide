/**
 * 表の描画。編集画面・サムネイル・発表画面・書き出しで共用する。
 * 行の高さは固定（要素の高さ ÷ 行数）で、セルに収まらない文字は切る。
 * 色の決め方は `@shared/table` の cellStyle を pptx 書き出しと共有している。
 */
import type { TableElement, Theme } from '@shared/deck'
import { cellStyle, columnWidthsPx, tableColors } from '@shared/table'

/** セルの左右の余白（論理 px）。pptx の余白もこれに合わせる。 */
export const TABLE_CELL_PADDING_X = 10

export function TableElementView({ element, theme }: { element: TableElement; theme: Theme }) {
  const colors = tableColors(element, theme)
  const widths = columnWidthsPx(element)
  const rowHeight = element.h / element.rows.length

  return (
    <table
      className="slide-table"
      style={{
        width: element.w,
        height: element.h,
        fontFamily: element.fontFamily || theme.bodyFont,
        fontSize: element.fontSize,
      }}
    >
      <colgroup>
        {widths.map((width, index) => (
          <col key={index} style={{ width }} />
        ))}
      </colgroup>
      <tbody>
        {element.rows.map((row, rowIndex) => (
          <tr key={rowIndex} style={{ height: rowHeight }}>
            {row.map((cell, colIndex) => {
              const style = cellStyle(element, rowIndex, colIndex, colors)
              return (
                <td
                  key={colIndex}
                  style={{
                    background: style.fill,
                    color: style.color,
                    fontWeight: style.bold ? 700 : 400,
                    textAlign: style.align,
                    borderColor: colors.border,
                    padding: `0 ${TABLE_CELL_PADDING_X}px`,
                  }}
                >
                  {/* 行の高さを超える文字で行が伸びないよう、中身の高さを行に合わせて切る */}
                  <div className="slide-table-cell" style={{ maxHeight: rowHeight - 2 }}>
                    {cell.text}
                  </div>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
