/**
 * 使えるフォントの定義。CSS のフォント指定と、pptx 書き出し時のフォント名を対にして持つ。
 *
 * アプリの表示には同梱した Noto を使い、どの PC でも同じ見た目になるようにしている。
 * 一方 pptx は「相手の PowerPoint にあるフォント」で開かれるため、Windows / Office に
 * 標準で入っている游書体を指定する。同じ書体の系統（ゴシック / 明朝）を保ちつつ、
 * 受け取った側で文字化けや意図しない代替が起きないようにするための使い分け。
 */
export interface FontChoice {
  id: 'gothic' | 'mincho' | 'mono'
  label: string
  /** 画面表示用の font-family。先頭は同梱フォント。 */
  css: string
  /** pptx 書き出し時に指定するフォント名。 */
  pptx: string
}

export const FONT_CHOICES: FontChoice[] = [
  {
    id: 'gothic',
    label: 'ゴシック体',
    css: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
    pptx: 'Yu Gothic',
  },
  {
    id: 'mincho',
    label: '明朝体',
    css: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
    pptx: 'Yu Mincho',
  },
  {
    id: 'mono',
    label: '等幅',
    css: '"Noto Sans Mono", "SF Mono", Consolas, "Noto Sans JP", monospace',
    pptx: 'Consolas',
  },
]

export const GOTHIC = FONT_CHOICES[0].css
export const MINCHO = FONT_CHOICES[1].css

/**
 * CSS のフォント指定から pptx 用のフォント名を求める。
 * 既知の選択肢に当てはまらない場合は、先頭のフォント名をそのまま使う。
 */
export function pptxFontFor(cssFontFamily: string, fallback: string): string {
  const source = cssFontFamily.trim() || fallback
  const known = FONT_CHOICES.find((choice) => choice.css === source)
  if (known) return known.pptx

  const first = (source.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
  return first || FONT_CHOICES[0].pptx
}
