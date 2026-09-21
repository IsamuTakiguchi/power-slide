/**
 * リボンやステータスバーで使う線画アイコン。
 * 外部のアイコン集は入れず、20x20 の viewBox に手で描いた最小限のセットにしている。
 * すべて currentColor で描くので、ボタンの文字色にそのまま追従する。
 */
import type { ReactNode, SVGProps } from 'react'

export type IconName =
  | 'save'
  | 'undo'
  | 'redo'
  | 'newSlide'
  | 'duplicate'
  | 'trash'
  | 'textBox'
  | 'shapes'
  | 'image'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'fontColor'
  | 'fontGrow'
  | 'fontShrink'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignTop'
  | 'alignMiddle'
  | 'alignBottom'
  | 'play'
  | 'playCurrent'
  | 'notes'
  | 'fitWindow'
  | 'zoomIn'
  | 'zoomOut'
  | 'chevronDown'
  | 'layout'
  | 'newFile'
  | 'folderOpen'
  | 'export'
  | 'close'
  | 'front'
  | 'back'
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'appLogo'

/** 各アイコンの描画内容。stroke ベースが基本で、塗りが必要なものだけ fill を持つ。 */
const PATHS: Record<IconName, ReactNode> = {
  save: (
    <>
      <path d="M4 3h9l3 3v11H4z" />
      <path d="M7 3v4h5V3M7 16v-5h6v5" />
    </>
  ),
  undo: (
    <>
      <path d="M7 5 3.5 8.5 7 12" />
      <path d="M3.5 8.5H12a4 4 0 0 1 0 8H9" />
    </>
  ),
  redo: (
    <>
      <path d="m13 5 3.5 3.5L13 12" />
      <path d="M16.5 8.5H8a4 4 0 0 0 0 8h3" />
    </>
  ),
  newSlide: (
    <>
      <rect x="2.5" y="4" width="15" height="11" rx="1" />
      <path d="M10 7v5M7.5 9.5h5" />
    </>
  ),
  duplicate: (
    <>
      <rect x="6.5" y="6.5" width="10" height="10" rx="1" />
      <path d="M3.5 13.5v-9a1 1 0 0 1 1-1h9" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" />
    </>
  ),
  textBox: (
    <>
      <rect x="2.5" y="4" width="15" height="12" rx="1" strokeDasharray="2.5 1.5" />
      <path d="M7 8h6M10 8v5" />
    </>
  ),
  shapes: (
    <>
      <rect x="2.5" y="9.5" width="8" height="8" rx="1" />
      <circle cx="13" cy="7" r="4.5" />
    </>
  ),
  image: (
    <>
      <rect x="2.5" y="4" width="15" height="12" rx="1" />
      <path d="m2.5 14 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" />
      <circle cx="13.5" cy="7.5" r="1.3" />
    </>
  ),
  bold: (
    <path
      d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z"
      strokeWidth="1.9"
    />
  ),
  italic: <path d="M12 4H8M12 4l-4 12M8 16H4M12 16H8" strokeWidth="1.6" />,
  underline: (
    <>
      <path d="M6 4v6a4 4 0 0 0 8 0V4" />
      <path d="M5 17h10" strokeWidth="1.8" />
    </>
  ),
  fontColor: (
    <>
      <path d="m5 13 5-10 5 10M6.8 9.5h6.4" />
      <path d="M4 17h12" strokeWidth="2.6" />
    </>
  ),
  fontGrow: (
    <>
      <path d="m3 15 4-9 4 9M4.5 12h5" />
      <path d="M14 5v6M11 8h6" />
    </>
  ),
  fontShrink: (
    <>
      <path d="m3 15 4-9 4 9M4.5 12h5" />
      <path d="M11 8h6" />
    </>
  ),
  alignLeft: <path d="M3 5h14M3 8.5h9M3 12h14M3 15.5h9" />,
  alignCenter: <path d="M3 5h14M5.5 8.5h9M3 12h14M5.5 15.5h9" />,
  alignRight: <path d="M3 5h14M8 8.5h9M3 12h14M8 15.5h9" />,
  alignTop: (
    <>
      <path d="M3 3.5h14" />
      <rect x="5.5" y="6.5" width="9" height="8" rx="0.8" />
    </>
  ),
  alignMiddle: (
    <>
      <path d="M3 10h14" />
      <rect x="5.5" y="6" width="9" height="8" rx="0.8" />
    </>
  ),
  alignBottom: (
    <>
      <path d="M3 16.5h14" />
      <rect x="5.5" y="5.5" width="9" height="8" rx="0.8" />
    </>
  ),
  play: <path d="M6 3.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  playCurrent: (
    <>
      <rect x="2.5" y="4" width="15" height="11" rx="1" />
      <path d="M8.5 7v5l4-2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  notes: (
    <>
      <rect x="3.5" y="3" width="13" height="14" rx="1" />
      <path d="M6.5 7h7M6.5 10h7M6.5 13h4" />
    </>
  ),
  fitWindow: (
    <>
      <path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" />
    </>
  ),
  zoomIn: <path d="M10 4v12M4 10h12" strokeWidth="1.8" />,
  zoomOut: <path d="M4 10h12" strokeWidth="1.8" />,
  chevronDown: <path d="m5 8 5 5 5-5" />,
  layout: (
    <>
      <rect x="2.5" y="4" width="15" height="12" rx="1" />
      <path d="M2.5 8.5h15M9 8.5V16" />
    </>
  ),
  newFile: (
    <>
      <path d="M5 2.5h6l4 4V17.5H5z" />
      <path d="M11 2.5v4h4M8 12h4M10 10v4" />
    </>
  ),
  folderOpen: (
    <>
      <path d="M2.5 5.5h5l1.5 1.5h8v8.5h-14.5z" />
      <path d="M2.5 9.5h15" />
    </>
  ),
  export: (
    <>
      <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
      <path d="M4 14v3h12v-3" />
    </>
  ),
  close: <path d="m5 5 10 10M15 5 5 15" />,
  front: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.18" />
      <path d="M3 13V3h10" />
    </>
  ),
  back: (
    <>
      <rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor" fillOpacity="0.18" />
      <path d="M17 7v10H7" />
    </>
  ),
  rect: <rect x="3" y="5" width="14" height="10" rx="0.5" />,
  roundRect: <rect x="3" y="5" width="14" height="10" rx="3" />,
  ellipse: <ellipse cx="10" cy="10" rx="7" ry="5" />,
  triangle: <path d="m10 4 7 12H3z" strokeLinejoin="round" />,
  line: <path d="M3 16 17 4" />,
  arrow: <path d="M3 16 17 4M11 4h6v6" />,
  // アプリのロゴ（アイコンと同じモチーフを線画にしたもの）
  appLogo: (
    <>
      <rect x="2.5" y="4" width="15" height="10" rx="1.5" fill="#fff" stroke="none" />
      <rect x="4.5" y="6" width="6" height="1.6" rx="0.8" fill="#C43E1C" stroke="none" />
      <rect x="4.5" y="9" width="8.5" height="1.3" rx="0.65" fill="#F0A58E" stroke="none" />
      <circle cx="14.5" cy="14.5" r="3.6" fill="#8F3419" stroke="none" />
      <path d="M13.4 12.6v3.8l3-1.9z" fill="#fff" stroke="none" />
    </>
  ),
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
