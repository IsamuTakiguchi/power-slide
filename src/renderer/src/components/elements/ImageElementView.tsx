import type { ImageElement } from '@shared/deck'

interface Props {
  element: ImageElement
}

export function ImageElementView({ element }: Props) {
  return (
    <img
      src={element.dataUrl}
      alt=""
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: element.fit,
        display: 'block',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  )
}
