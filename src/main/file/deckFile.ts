/**
 * `.pslide` ファイルの読み書き。
 *
 * 自動保存があるため、「アプリ外で手直しされたファイルを黙って上書きしない」ことを
 * この層の責任として持つ。アプリが書き込むたびに mtime とサイズを記録し、次に書く前に
 * 実ファイルと照合する。食い違えば書き込まずに呼び出し側へ知らせる。
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import {
  SCHEMA_VERSION,
  type Background,
  type Deck,
  type ImageElement,
  type ShapeElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type TextAlign,
  type TextElement,
  type TextRun,
  type Theme,
  type VerticalAlign,
} from '@shared/deck'
import { DEFAULT_THEME_ID } from '@shared/themes'

export interface FileStamp {
  mtimeMs: number
  size: number
}

/** 「最後にアプリ自身が書いた状態」の記録。キーは絶対パス。 */
const stamps = new Map<string, FileStamp>()

async function readStamp(filePath: string): Promise<FileStamp | null> {
  try {
    const info = await stat(filePath)
    return { mtimeMs: info.mtimeMs, size: info.size }
  } catch {
    return null
  }
}

export function getStamp(filePath: string): FileStamp | null {
  return stamps.get(filePath) ?? null
}

export function forgetStamp(filePath: string): void {
  stamps.delete(filePath)
}

/**
 * アプリの外でファイルが変わっていないかを確かめる。
 * 記録がない（一度も読み書きしていない）場合は「変更あり」とみなして安全側に倒す。
 */
export async function isExternallyChanged(filePath: string): Promise<boolean> {
  const known = stamps.get(filePath)
  if (!known) return true
  const current = await readStamp(filePath)
  if (!current) return true
  return current.mtimeMs !== known.mtimeMs || current.size !== known.size
}

export interface ReadDeckResult {
  deck: Deck
  schemaWarning?: string
}

export async function readDeck(filePath: string): Promise<ReadDeckResult> {
  const text = await readFile(filePath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('ファイルの中身が JSON として読めませんでした。')
  }
  const { deck, schemaWarning } = normalizeDeck(parsed)
  const stamp = await readStamp(filePath)
  if (stamp) stamps.set(filePath, stamp)
  return { deck, schemaWarning }
}

export async function writeDeck(filePath: string, deck: Deck): Promise<FileStamp> {
  const payload: Deck = { ...deck, schemaVersion: SCHEMA_VERSION }
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  const stamp = await readStamp(filePath)
  const resolved = stamp ?? { mtimeMs: Date.now(), size: 0 }
  stamps.set(filePath, resolved)
  return resolved
}

// ------------------------------------------------------------------ 検証

/**
 * 外部ファイル由来の JSON を Deck として使える形に正規化する。
 * 壊れた値は既定値に落とし、決定的に壊れているものだけ例外を投げる。
 */
export function normalizeDeck(input: unknown): ReadDeckResult {
  if (!isRecord(input)) throw new Error('スライドデータの形式が正しくありません。')
  const slidesRaw = input.slides
  if (!Array.isArray(slidesRaw)) throw new Error('スライドの配列が見つかりませんでした。')

  const version = num(input.schemaVersion, SCHEMA_VERSION)
  const schemaWarning =
    version > SCHEMA_VERSION
      ? `このファイルは新しい形式（バージョン ${version}）で保存されています。一部の設定が失われる可能性があります。`
      : undefined

  const slides = slidesRaw.map(normalizeSlide).filter((slide): slide is Slide => slide !== null)
  if (slides.length === 0) throw new Error('読み込めるスライドがありませんでした。')

  const deck: Deck = {
    schemaVersion: SCHEMA_VERSION,
    title: str(input.title, '無題のプレゼンテーション'),
    themeId: str(input.themeId, DEFAULT_THEME_ID),
    slides,
  }
  const theme = normalizeTheme(input.theme)
  if (theme) deck.theme = theme
  return { deck, schemaWarning }
}

function normalizeSlide(input: unknown, index: number): Slide | null {
  if (!isRecord(input)) return null
  const elementsRaw = Array.isArray(input.elements) ? input.elements : []
  return {
    id: str(input.id, `sl_restored_${index}`),
    layoutId: str(input.layoutId, 'blank'),
    background: normalizeBackground(input.background),
    elements: elementsRaw
      .map(normalizeElement)
      .filter((element): element is SlideElement => element !== null),
    notes: str(input.notes, ''),
  }
}

function normalizeBackground(input: unknown): Background | undefined {
  if (!isRecord(input)) return undefined
  const color = str(input.color, '')
  if (!color) return undefined
  return { type: 'color', color }
}

function normalizeElement(input: unknown, index: number): SlideElement | null {
  if (!isRecord(input)) return null
  const base = {
    id: str(input.id, `el_restored_${index}`),
    x: num(input.x, 0),
    y: num(input.y, 0),
    w: Math.max(1, num(input.w, 100)),
    h: Math.max(1, num(input.h, 100)),
    rotation: num(input.rotation, 0),
  }

  switch (input.type) {
    case 'text': {
      const element: TextElement = {
        ...base,
        type: 'text',
        runs: normalizeRuns(input.runs),
        fontFamily: str(input.fontFamily, ''),
        fontSize: Math.max(4, num(input.fontSize, 28)),
        align: oneOf<TextAlign>(input.align, ['left', 'center', 'right'], 'left'),
        vAlign: oneOf<VerticalAlign>(input.vAlign, ['top', 'middle', 'bottom'], 'top'),
        lineHeight: Math.max(0.8, num(input.lineHeight, 1.4)),
      }
      if (input.role === 'title' || input.role === 'body') element.role = input.role
      return element
    }
    case 'shape': {
      const element: ShapeElement = {
        ...base,
        type: 'shape',
        shape: oneOf<ShapeKind>(
          input.shape,
          ['rect', 'roundRect', 'ellipse', 'triangle', 'line', 'arrow'],
          'rect',
        ),
        fill: optionalStr(input.fill),
        stroke: optionalStr(input.stroke),
        strokeWidth: Math.max(0, num(input.strokeWidth, 2)),
      }
      if (isRecord(input.text)) {
        element.text = {
          runs: normalizeRuns(input.text.runs),
          fontFamily: str(input.text.fontFamily, ''),
          fontSize: Math.max(4, num(input.text.fontSize, 22)),
          align: oneOf<TextAlign>(input.text.align, ['left', 'center', 'right'], 'center'),
        }
      }
      return element
    }
    case 'image': {
      const dataUrl = str(input.dataUrl, '')
      if (!dataUrl.startsWith('data:')) return null
      const element: ImageElement = {
        ...base,
        type: 'image',
        dataUrl,
        mime: str(input.mime, 'image/png'),
        fit: input.fit === 'cover' ? 'cover' : 'contain',
      }
      const ratio = num(input.naturalRatio, 0)
      if (ratio > 0) element.naturalRatio = ratio
      return element
    }
    default:
      return null
  }
}

function normalizeRuns(input: unknown): TextRun[] {
  if (!Array.isArray(input)) return [{ text: '' }]
  const runs = input
    .filter(isRecord)
    .map((run): TextRun => {
      const normalized: TextRun = { text: str(run.text, '') }
      if (run.bold === true) normalized.bold = true
      if (run.italic === true) normalized.italic = true
      if (run.underline === true) normalized.underline = true
      const color = optionalStr(run.color)
      if (color) normalized.color = color
      return normalized
    })
  return runs.length > 0 ? runs : [{ text: '' }]
}

function normalizeTheme(input: unknown): Theme | undefined {
  if (!isRecord(input)) return undefined
  const id = str(input.id, '')
  if (!id) return undefined
  return {
    id,
    name: str(input.name, id),
    background: str(input.background, '#ffffff'),
    titleColor: str(input.titleColor, '#1a1a1a'),
    bodyColor: str(input.bodyColor, '#333333'),
    accent: str(input.accent, '#2563eb'),
    titleFont: str(input.titleFont, ''),
    bodyFont: str(input.bodyFont, ''),
    palette: Array.isArray(input.palette)
      ? input.palette.filter((color): color is string => typeof color === 'string')
      : [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}
