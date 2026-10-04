/**
 * クリップボードの中身を表の格子として読む（Excel・Google スプレッドシート・Word などから）。
 *
 * Excel はタブ区切りのテキストと HTML の両方を入れるので、タブ区切りを優先し、
 * テキストが無いときや表として読めないときだけ HTML の <table> を見る。
 */
import { isGridText, parseTsv } from '@shared/table'

/** HTML の最初の表を文字の格子にする。結合セルは左上に文字を置き、残りを空にする。 */
export function parseHtmlTable(html: string): string[][] | null {
  if (!html || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null
  const grid: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const row: string[] = []
    for (const cell of Array.from(tr.querySelectorAll('td, th'))) {
      for (const br of Array.from(cell.querySelectorAll('br'))) br.replaceWith('\n')
      row.push((cell.textContent ?? '').replace(/\u00a0/g, ' ').trim())
      const span = Number(cell.getAttribute('colspan') ?? '1')
      for (let extra = 1; extra < span; extra += 1) row.push('')
    }
    grid.push(row)
  }
  if (grid.length === 0) return null
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (width === 0) return null
  return grid.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
}

/** 表として貼り付けるべき中身なら格子を返す（タブ区切り、または HTML の表）。 */
export function gridFromClipboard(text: string, html: string): string[][] | null {
  if (text && isGridText(text)) return parseTsv(text)
  return parseHtmlTable(html)
}
