import type { CSSProperties } from 'react'
import type { ShapeElement, Theme } from '@shared/deck'

interface Props {
  element: ShapeElement
  theme: Theme
}

/** 図形は要素ローカル座標の inline SVG で描く。線幅が論理 px どおりになる。 */
export function ShapeElementView({ element, theme }: Props) {
  const { w, h, shape, strokeWidth } = element
  const fill = element.fill ?? (shape === 'line' || shape === 'arrow' ? 'none' : theme.accent)
  const stroke = element.stroke || 'none'
  const lineColor = element.stroke || theme.accent
  const markerId = `arrow-${element.id}`

  const textStyle: CSSProperties | null = element.text
    ? {
        fontFamily: element.text.fontFamily || theme.bodyFont,
        fontSize: element.text.fontSize,
        textAlign: element.text.align,
        color: element.text.runs.find((run) => run.color)?.color ?? theme.bodyColor,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        width: '100%',
      }
    : null

  return (
    <>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        aria-hidden
      >
        {shape === 'arrow' && (
          <defs>
            <marker
              id={markerId}
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L10,4 L0,8 z" fill={lineColor} />
            </marker>
          </defs>
        )}

        {shape === 'rect' && (
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={Math.max(0, w - strokeWidth)}
            height={Math.max(0, h - strokeWidth)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {shape === 'roundRect' && (
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={Math.max(0, w - strokeWidth)}
            height={Math.max(0, h - strokeWidth)}
            rx={Math.min(24, Math.min(w, h) / 6)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {shape === 'ellipse' && (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={Math.max(0, w / 2 - strokeWidth / 2)}
            ry={Math.max(0, h / 2 - strokeWidth / 2)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {shape === 'triangle' && (
          <polygon
            points={`${w / 2},${strokeWidth / 2} ${w - strokeWidth / 2},${h - strokeWidth / 2} ${strokeWidth / 2},${h - strokeWidth / 2}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        )}

        {(shape === 'line' || shape === 'arrow') && (
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={lineColor}
            strokeWidth={Math.max(1, strokeWidth)}
            markerEnd={shape === 'arrow' ? `url(#${markerId})` : undefined}
          />
        )}
      </svg>

      {element.text && textStyle && (
        <div className="element-inner" style={{ alignItems: 'center', padding: 8 }}>
          <div style={textStyle}>
            {element.text.runs.map((run, index) => (
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
      )}
    </>
  )
}
