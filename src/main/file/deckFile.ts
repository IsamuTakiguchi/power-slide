/**
 * `.pslide` ファイルの読み書き（Electron 側）。
 *
 * 自動保存があるため、「アプリ外で手直しされたファイルを黙って上書きしない」ことを
 * この層の責任として持つ。アプリが書き込むたびに mtime とサイズを記録し、次に書く前に
 * 実ファイルと照合する。食い違えば書き込まずに呼び出し側へ知らせる。
 *
 * JSON の検証・正規化は Web 版と共有するため `@shared/deckFile` にある。
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import type { Deck } from '@shared/deck'
import { parseDeck, serializeDeck, type ReadDeckResult } from '@shared/deckFile'

export { normalizeDeck, type ReadDeckResult } from '@shared/deckFile'

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

export async function readDeck(filePath: string): Promise<ReadDeckResult> {
  const text = await readFile(filePath, 'utf8')
  const result = parseDeck(text)
  const stamp = await readStamp(filePath)
  if (stamp) stamps.set(filePath, stamp)
  return result
}

export async function writeDeck(filePath: string, deck: Deck): Promise<FileStamp> {
  await writeFile(filePath, serializeDeck(deck), 'utf8')
  const stamp = await readStamp(filePath)
  const resolved = stamp ?? { mtimeMs: Date.now(), size: 0 }
  stamps.set(filePath, resolved)
  return resolved
}
