import type { Theme } from './deck'

const GOTHIC = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif'
const MINCHO = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "MS PMincho", serif'

export const THEMES: Theme[] = [
  {
    id: 'light',
    name: 'ライト',
    background: '#ffffff',
    titleColor: '#1a1a1a',
    bodyColor: '#333333',
    accent: '#2563eb',
    titleFont: GOTHIC,
    bodyFont: GOTHIC,
    palette: ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#1a1a1a'],
  },
  {
    id: 'dark',
    name: 'ダーク',
    background: '#141821',
    titleColor: '#f8fafc',
    bodyColor: '#cbd5e1',
    accent: '#38bdf8',
    titleFont: GOTHIC,
    bodyFont: GOTHIC,
    palette: ['#38bdf8', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#94a3b8', '#f8fafc'],
  },
  {
    id: 'navy',
    name: 'ネイビー',
    background: '#0f2942',
    titleColor: '#ffffff',
    bodyColor: '#d6e4f0',
    accent: '#f0b429',
    titleFont: GOTHIC,
    bodyFont: GOTHIC,
    palette: ['#f0b429', '#4fc3f7', '#81c784', '#ff8a65', '#ba68c8', '#ffffff', '#90a4ae', '#0f2942'],
  },
  {
    id: 'washi',
    name: '和紙（明朝）',
    background: '#f7f3e9',
    titleColor: '#3b2f2a',
    bodyColor: '#4a3f38',
    accent: '#9c4a3c',
    titleFont: MINCHO,
    bodyFont: MINCHO,
    palette: ['#9c4a3c', '#7d6b52', '#4f6d4a', '#c08a3e', '#3b2f2a', '#8a6f8e', '#a89b84', '#f7f3e9'],
  },
  {
    id: 'mono',
    name: 'モノクロ',
    background: '#fafafa',
    titleColor: '#111111',
    bodyColor: '#3f3f3f',
    accent: '#111111',
    titleFont: GOTHIC,
    bodyFont: GOTHIC,
    palette: ['#111111', '#3f3f3f', '#6b6b6b', '#9a9a9a', '#c4c4c4', '#e5e5e5', '#fafafa', '#ffffff'],
  },
]

export const DEFAULT_THEME_ID = 'light'

export function findTheme(themeId: string): Theme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]
}

/** Deck に保存されたテーマ（カスタム優先）を解決する。 */
export function resolveTheme(themeId: string, custom?: Theme): Theme {
  if (custom && custom.id === themeId) return custom
  return findTheme(themeId)
}
