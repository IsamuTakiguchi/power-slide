/**
 * 発表者モード。全画面でスライドを送り、ノートと経過時間を手元で確認できる。
 *
 * ・→ / ↓ / Space / PageDown : 次へ    ・← / ↑ / PageUp : 前へ
 * ・Home / End : 先頭・末尾            ・N : ノート表示     ・B : 黒画面
 * ・Esc : 終了
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@shared/geometry'
import { resolveTheme } from '@shared/themes'
import { useDeckStore } from '../store/deckStore'
import { stopPresenting } from '../lib/commands'
import { SlideView } from './SlideView'

function formatElapsed(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function Presenter() {
  const slides = useDeckStore((state) => state.deck.slides)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const startIndex = useDeckStore((state) => state.slideIndex)
  const selectSlide = useDeckStore((state) => state.selectSlide)

  const theme = resolveTheme(themeId, customTheme)
  const [index, setIndex] = useState(startIndex)
  const [showNotes, setShowNotes] = useState(false)
  const [blackout, setBlackout] = useState(false)
  const [scale, setScale] = useState(1)
  const [elapsed, setElapsed] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const [cursorHidden, setCursorHidden] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slide = slides[index] ?? slides[0]

  const exit = useCallback(() => {
    // 発表を終えた位置を編集画面にも反映する
    selectSlide(index)
    void stopPresenting()
  }, [index, selectSlide])

  // 画面サイズに合わせて倍率を決める
  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / SLIDE_WIDTH, window.innerHeight / SLIDE_HEIGHT))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // 経過時間
  useEffect(() => {
    if (!timerRunning) return
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [timerRunning])

  // 3 秒動かさなければカーソルを隠す
  useEffect(() => {
    const onMove = () => {
      setCursorHidden(false)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => setCursorHidden(true), 3000)
    }
    onMove()
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          event.preventDefault()
          setIndex((value) => Math.min(slides.length - 1, value + 1))
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault()
          setIndex((value) => Math.max(0, value - 1))
          break
        case 'Home':
          event.preventDefault()
          setIndex(0)
          break
        case 'End':
          event.preventDefault()
          setIndex(slides.length - 1)
          break
        case 'n':
        case 'N':
          setShowNotes((value) => !value)
          break
        case 'b':
        case 'B':
          setBlackout((value) => !value)
          break
        case 'Escape':
          event.preventDefault()
          exit()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [slides.length, exit])

  if (!slide) return null

  // タップ／クリックでも送れるようにする（スマホにはキーボードが無い）。左端 3 割で戻る
  const handleTap = (event: MouseEvent<HTMLDivElement>) => {
    const ratio = event.clientX / window.innerWidth
    if (ratio < 0.3) setIndex((value) => Math.max(0, value - 1))
    else setIndex((value) => Math.min(slides.length - 1, value + 1))
  }

  return (
    <div className={['presenter', cursorHidden ? 'is-cursor-hidden' : ''].join(' ')}>
      {blackout ? (
        <div className="presenter-blackout" onClick={handleTap} />
      ) : (
        <div className="presenter-stage" onClick={handleTap}>
          <SlideView slide={slide} theme={theme} scale={scale} />
        </div>
      )}

      <div className="presenter-hud">
        <span className="presenter-page">
          {index + 1} / {slides.length}
        </span>
        <button type="button" onClick={() => setTimerRunning((value) => !value)}>
          {formatElapsed(elapsed)} {timerRunning ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          onClick={() => {
            setElapsed(0)
            setTimerRunning(true)
          }}
        >
          リセット
        </button>
        <button type="button" onClick={() => setShowNotes((value) => !value)}>
          ノート (N)
        </button>
        <button type="button" onClick={exit}>
          終了 (Esc)
        </button>
      </div>

      {showNotes && (
        <div className="presenter-notes">
          <h4>スピーカーノート</h4>
          <p>{slide.notes.trim() || 'このスライドにはノートがありません。'}</p>
        </div>
      )}
    </div>
  )
}
