/**
 * リボンを組み立てる部品。
 *
 * PowerPoint のリボンは「グループ（下にラベル）」に「大きなボタン（アイコンの下に文字）」と
 * 「小さなボタン（アイコルの横に文字）」が並ぶ構造なので、その 3 つを部品にしている。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-body">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  )
}

interface ButtonBase {
  icon: IconName
  label?: string
  /** 表示ラベルと別の読み上げ名が要るとき（アイコンだけのボタンなど）。 */
  ariaLabel?: string
  title?: string
  onClick?: () => void
  disabled?: boolean
  /** トグル系のボタンで押下状態を表す。 */
  active?: boolean
  className?: string
}

/** アイコンの下にラベルが付く大きなボタン。 */
export function BigButton({
  icon,
  label,
  ariaLabel,
  title,
  onClick,
  disabled,
  active,
  className,
}: ButtonBase) {
  return (
    <button
      type="button"
      className={['ribbon-big', active ? 'is-active' : '', className ?? ''].join(' ').trim()}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={28} />
      {label && <span className="ribbon-big-label">{label}</span>}
    </button>
  )
}

/** アイコンの横にラベルが付く（または無い）小さなボタン。 */
export function SmallButton({
  icon,
  label,
  ariaLabel,
  title,
  onClick,
  disabled,
  active,
  className,
}: ButtonBase) {
  return (
    <button
      type="button"
      className={['ribbon-small', active ? 'is-active' : '', className ?? ''].join(' ').trim()}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      title={title ?? ariaLabel}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={18} />
      {label && <span>{label}</span>}
    </button>
  )
}

/** 小さなボタンを縦に積む列（PowerPoint の「複製／削除」のような並び）。 */
export function SmallStack({ children }: { children: ReactNode }) {
  return <div className="ribbon-small-stack">{children}</div>
}

/**
 * ドロップダウンの開閉。外側のクリックと Esc で閉じる。
 * 返り値の ref を、ボタンとパネルを包む要素に付ける。
 */
export function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return {
    open,
    ref,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
  }
}

/** ドロップダウンのパネル本体。 */
export function DropdownPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={['dropdown', className ?? ''].join(' ').trim()}>{children}</div>
}

/**
 * 大きなボタンに「▾」を添えた分割ボタン。本体クリックは既定の動作、
 * ▾ はメニューを開く（PowerPoint の「新しいスライド」と同じ振る舞い）。
 */
export function BigSplitButton({
  icon,
  label,
  onClick,
  menuLabel,
  disabled,
  menu,
}: {
  icon: IconName
  label: string
  onClick: () => void
  /** ▾ 部分の読み上げ名。 */
  menuLabel: string
  disabled?: boolean
  /** メニューの中身。close を呼ぶと閉じられる。 */
  menu: (close: () => void) => ReactNode
}) {
  const dropdown = useDropdown()
  return (
    <div className="ribbon-split menu-anchor" ref={dropdown.ref}>
      <button
        type="button"
        className="ribbon-big"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Icon name={icon} size={28} />
        <span className="ribbon-big-label">{label}</span>
      </button>
      <button
        type="button"
        className="ribbon-split-arrow"
        aria-label={menuLabel}
        aria-expanded={dropdown.open}
        onClick={dropdown.toggle}
        disabled={disabled}
      >
        <Icon name="chevronDown" size={14} />
      </button>
      {dropdown.open && <DropdownPanel className="is-left">{menu(dropdown.close)}</DropdownPanel>}
    </div>
  )
}

/** 大きなボタンそのものがメニューを開くタイプ（「図形」など）。 */
export function BigMenuButton({
  icon,
  label,
  menu,
}: {
  icon: IconName
  label: string
  menu: (close: () => void) => ReactNode
}) {
  const dropdown = useDropdown()
  return (
    <div className="menu-anchor" ref={dropdown.ref}>
      <button
        type="button"
        className="ribbon-big has-menu"
        aria-expanded={dropdown.open}
        onClick={dropdown.toggle}
      >
        <Icon name={icon} size={28} />
        <span className="ribbon-big-label">
          {label} <Icon name="chevronDown" size={11} />
        </span>
      </button>
      {dropdown.open && <DropdownPanel className="is-left">{menu(dropdown.close)}</DropdownPanel>}
    </div>
  )
}
