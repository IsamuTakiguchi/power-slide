/**
 * スライド 1 枚の描画。編集キャンバス・サムネイル・発表画面・書き出しで共用する。
 * 見た目の定義をここ 1 か所に閉じることで、画面と書き出しのずれを防ぐ。
 */
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Slide, SlideElement, Theme } from '@shared/deck'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'
import { TextElementView } from './elements/TextElementView'
import { ShapeElementView } from './elements/ShapeElementView'
import { ImageElementView } from './elements/ImageElementView'

export interface SlideViewProps {
  slide: Slide
  theme: Theme
  /** 1 = 1280x720 の実寸。 */
  scale: number
  interactive?: boolean
  selectedIds?: string[]
  editingId?: string | null
  onElementPointerDown?: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void
  onElementDoubleClick?: (id: string) => void
  onBackgroundPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onCommitText?: (id: string, text: string) => void
  onFinishEditing?: () => void
}

function ElementBody({
  element,
  theme,
  editing,
  onCommitText,
  onFinishEditing,
}: {
  element: SlideElement
  theme: Theme
  editing: boolean
  onCommitText?: (text: string) => void
  onFinishEditing?: () => void
}) {
  switch (element.type) {
    case 'text':
      return (
        <TextElementView
          element={element}
          theme={theme}
          editing={editing}
          onCommitText={onCommitText}
          onFinishEditing={onFinishEditing}
        />
      )
    case 'shape':
      return <ShapeElementView element={element} theme={theme} />
    case 'image':
      return <ImageElementView element={element} />
  }
}

export function SlideView({
  slide,
  theme,
  scale,
  interactive = false,
  selectedIds = [],
  editingId = null,
  onElementPointerDown,
  onElementDoubleClick,
  onBackgroundPointerDown,
  onCommitText,
  onFinishEditing,
}: SlideViewProps) {
  const background = slide.background?.color ?? theme.background

  return (
    <div
      className="slide-view"
      style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
    >
      <div
        className="slide-surface"
        style={{
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: `scale(${scale})`,
          background,
        }}
        onPointerDown={interactive ? onBackgroundPointerDown : undefined}
      >
        {slide.elements.map((element) => {
          const isEditing = interactive && editingId === element.id
          return (
            <div
              key={element.id}
              className={[
                'slide-element',
                selectedIds.includes(element.id) ? 'is-selected' : '',
                isEditing ? 'is-editing' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-element-id={element.id}
              style={{
                left: element.x,
                top: element.y,
                width: element.w,
                height: element.h,
                transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? (isEditing ? 'text' : 'move') : 'default',
              }}
              onPointerDown={(event) => {
                if (!interactive || isEditing) return
                event.stopPropagation()
                onElementPointerDown?.(element.id, event)
              }}
              onDoubleClick={(event) => {
                if (!interactive) return
                event.stopPropagation()
                onElementDoubleClick?.(element.id)
              }}
            >
              <ElementBody
                element={element}
                theme={theme}
                editing={isEditing}
                onCommitText={(text) => onCommitText?.(element.id, text)}
                onFinishEditing={onFinishEditing}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
