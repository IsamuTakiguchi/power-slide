/**
 * 右クリック（タッチ操作では長押し）で出すメニューの入れ物。
 * PC では押した位置に出し、狭い画面では CSS（.is-compact .dropdown）で下から出るシートになる。
 * 外側を押すか Esc で閉じる。
 *
 * 表の上などの重なり（z-index）に埋もれないよう、画面全体の入れ物（.app-shell）の直下に描く。
 * .app-shell の下に置くのは、狭い画面向けの .is-compact の指定を効かせるため。
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useUiStore } from '../store/uiStore'

export interface MenuPoint {
  x: number
  y: number
}

export function ContextMenu({
  point,
  label,
  className,
  onClose,
  children,
}: {
  point: MenuPoint
  label: string
  className?: string
  onClose: () => void
  children: ReactNode
}) {
  const compact = useUiStore((state) => state.compact)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // 押した位置を基準にし、画面の下半分なら上向き・右端なら左向きに出して画面からはみ出さないようにする
  const position = compact
    ? undefined
    : {
        left: Math.max(8, Math.min(point.x, window.innerWidth - 240)),
        ...(point.y > window.innerHeight / 2
          ? { bottom: Math.max(8, window.innerHeight - point.y + 4) }
          : { top: point.y + 4 }),
      }

  const menu = (
    <div
      ref={ref}
      className={['dropdown', 'context-menu', className ?? ''].filter(Boolean).join(' ')}
      role="menu"
      aria-label={label}
      style={position}
      // メニューの中の操作で、裏の表やスライドの操作が始まらないようにする
      // （ポータルでも React のイベントは元の親に伝わるため、ここで止める）
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {children}
    </div>
  )
  const host = typeof document !== 'undefined' ? (document.querySelector('.app-shell') ?? document.body) : null
  return host ? createPortal(menu, host) : menu
}
