import { useEffect, useRef, type CSSProperties } from 'react'
import { runsToPlainText, type TextElement, type Theme } from '@shared/deck'

interface Props {
  element: TextElement
  theme: Theme
  /** インライン編集中かどうか。書き出し・サムネイルでは常に false。 */
  editing?: boolean
  onCommitText?: (text: string) => void
  onFinishEditing?: () => void
}

export function textColor(element: TextElement, theme: Theme): string {
  const runColor = element.runs.find((run) => run.color)?.color
  if (runColor) return runColor
  return element.role === 'title' ? theme.titleColor : theme.bodyColor
}

export function textFontFamily(element: TextElement, theme: Theme): string {
  if (element.fontFamily) return element.fontFamily
  return element.role === 'title' ? theme.titleFont : theme.bodyFont
}

function alignItems(element: TextElement): CSSProperties['alignItems'] {
  if (element.vAlign === 'middle') return 'center'
  if (element.vAlign === 'bottom') return 'flex-end'
  return 'flex-start'
}

/** 要素全体の書式は runs[0] を代表値として扱う（v1 の UI は要素単位で書式を変える）。 */
function leadRun(element: TextElement) {
  return element.runs[0] ?? { text: '' }
}

export function TextElementView({ element, theme, editing = false, onCommitText, onFinishEditing }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lead = leadRun(element)

  const innerStyle: CSSProperties = {
    width: '100%',
    fontFamily: textFontFamily(element, theme),
    fontSize: element.fontSize,
    lineHeight: element.lineHeight,
    textAlign: element.align,
    color: textColor(element, theme),
    fontWeight: lead.bold ? 700 : 400,
    fontStyle: lead.italic ? 'italic' : 'normal',
    textDecoration: lead.underline ? 'underline' : 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    outline: 'none',
  }

  // 編集開始時に一度だけ DOM へ文字を流し込み、以降は React に触らせない。
  // こうしないと日本語入力の変換中に再描画が割り込んでしまう。
  useEffect(() => {
    if (!editing) return
    const node = editorRef.current
    if (!node) return
    node.textContent = runsToPlainText(element.runs)
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // element.runs を依存に入れると変換中に再実行されるため、editing の切り替えだけを見る
  }, [editing])

  if (editing) {
    return (
      <div className="element-inner" style={{ alignItems: alignItems(element) }}>
        <div
          ref={editorRef}
          className="text-editor"
          style={innerStyle}
          contentEditable
          suppressContentEditableWarning
          onBlur={(event) => {
            onCommitText?.(event.currentTarget.innerText)
            onFinishEditing?.()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCommitText?.(event.currentTarget.innerText)
              onFinishEditing?.()
            }
            // 編集中はキャンバスのショートカットに渡さない
            event.stopPropagation()
          }}
        />
      </div>
    )
  }

  return (
    <div className="element-inner" style={{ alignItems: alignItems(element) }}>
      <div style={innerStyle}>
        {element.runs.map((run, index) => (
          <span
            key={index}
            style={{
              fontWeight: run.bold ? 700 : undefined,
              fontStyle: run.italic ? 'italic' : undefined,
              textDecoration: run.underline ? 'underline' : undefined,
              color: run.color,
            }}
          >
            {run.text}
          </span>
        ))}
      </div>
    </div>
  )
}
