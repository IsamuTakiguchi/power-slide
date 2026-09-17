/**
 * 書き出し専用ルート（`#/render`）。編集 UI を一切持たず、SlideView だけを描く。
 *
 * main プロセスは
 *   1. window.__psRenderSlide({ deck, mode, slideIndex }) を呼び、
 *   2. window.__psWhenRendered() の Promise が解決するのを待って
 *   3. printToPDF / capturePage する
 * という手順で使う。
 */
import { useEffect, useState } from 'react'
import type { RenderRequest } from '@shared/ipc'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'
import { resolveTheme } from '@shared/themes'
import { SlideView } from '../components/SlideView'

interface Deferred {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** main からの呼び出しと React の描画完了をつなぐ。 */
let pending: Deferred | null = null

/** フォント読み込みと画像デコードが終わるまで待つ。 */
async function waitForPaint(): Promise<void> {
  await document.fonts.ready
  const images = Array.from(document.images)
  await Promise.all(
    images.map((image) =>
      image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
    ),
  )
  // レイアウト確定後のフレームを 2 回待ってから撮らせる
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

export function RenderRoute() {
  const [request, setRequest] = useState<RenderRequest | null>(null)

  useEffect(() => {
    window.__psRenderSlide = (next) => {
      pending = createDeferred()
      setRequest(next)
    }
    window.__psWhenRendered = () => pending?.promise ?? Promise.resolve()
    return () => {
      delete window.__psRenderSlide
      delete window.__psWhenRendered
    }
  }, [])

  useEffect(() => {
    if (!request) return
    let canceled = false
    void waitForPaint().then(() => {
      if (!canceled) pending?.resolve()
    })
    return () => {
      canceled = true
    }
  }, [request])

  if (!request) return <div className="render-root" />

  const theme = resolveTheme(request.deck.themeId, request.deck.theme)

  if (request.mode === 'single') {
    const slide = request.deck.slides[request.slideIndex ?? 0]
    if (!slide) return <div className="render-root" />
    // ウィンドウサイズいっぱいに引き伸ばして 1 枚だけ描く（PNG 書き出し）
    const scale = Math.min(window.innerWidth / SLIDE_WIDTH, window.innerHeight / SLIDE_HEIGHT)
    return (
      <div className="render-root is-single">
        <SlideView slide={slide} theme={theme} scale={scale} />
      </div>
    )
  }

  // PDF 用: 1 スライド = 1 ページで縦に並べる
  return (
    <div className="render-root is-print">
      {request.deck.slides.map((slide, index) => (
        <div
          key={slide.id}
          className="print-page"
          style={{ breakAfter: index < request.deck.slides.length - 1 ? 'page' : 'auto' }}
        >
          <SlideView slide={slide} theme={theme} scale={1} />
        </div>
      ))}
    </div>
  )
}
