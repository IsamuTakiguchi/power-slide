/** `.pptx` 書き出し（Electron 側）。組み立ては Web 版と共有の `@shared/pptx`。 */
import type { Deck } from '@shared/deck'
import { buildPptx } from '@shared/pptx'

/** Deck を .pptx のバイト列に変換する。 */
export async function deckToPptxBuffer(deck: Deck): Promise<Buffer> {
  const data = (await buildPptx(deck).write({ outputType: 'nodebuffer' })) as Buffer
  return data
}
