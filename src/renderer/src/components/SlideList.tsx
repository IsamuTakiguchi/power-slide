/**
 * 左ペインのスライド一覧。サムネイルは SlideView をそのまま縮小して描くので、
 * 編集画面と見た目が必ず一致する。並べ替えは HTML5 の drag イベントで行う。
 */
import { useState } from 'react'
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'
import { SLIDE_WIDTH } from '@shared/geometry'
import { DEFAULT_LAYOUT_ID } from '@shared/layouts'
import { resolveTheme } from '@shared/themes'
import { Icon } from './Icon'
import { SlideView } from './SlideView'

/**
 * サムネイルの表示幅（px）。タブレットでは一覧を細く、スマホでは下の帯に横に並べるので
 * さらに小さくする。
 */
const THUMB_WIDTH = { desktop: 196, tablet: 150, phone: 104 }

export function SlideList() {
  const layout = useUiStore((state) => state.layout)
  const compact = useUiStore((state) => state.compact)
  const slides = useDeckStore((state) => state.deck.slides)
  const themeId = useDeckStore((state) => state.deck.themeId)
  const customTheme = useDeckStore((state) => state.deck.theme)
  const slideIndex = useDeckStore((state) => state.slideIndex)
  const selectSlide = useDeckStore((state) => state.selectSlide)
  const moveSlide = useDeckStore((state) => state.moveSlide)
  const addSlide = useDeckStore((state) => state.addSlide)
  const lastLayoutId = useDeckStore((state) => state.lastLayoutId)
  const duplicateSlide = useDeckStore((state) => state.duplicateSlide)
  const deleteSlide = useDeckStore((state) => state.deleteSlide)

  const theme = resolveTheme(themeId, customTheme)
  const scale = THUMB_WIDTH[layout] / SLIDE_WIDTH
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  return (
    <aside className="slide-list">
      <div className="slide-list-header">
        <span>スライド</span>
        <span className="slide-count">{slides.length} 枚</span>
      </div>
      <ol className="slide-list-items">
        {slides.map((slide, index) => (
          <li
            key={slide.id}
            className={[
              'slide-list-item',
              index === slideIndex ? 'is-current' : '',
              dropAt === index && dragFrom !== null && dragFrom !== index ? 'is-drop-target' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(event) => {
              event.preventDefault()
              setDropAt(index)
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setDropAt(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragFrom !== null && dragFrom !== index) moveSlide(dragFrom, index)
              setDragFrom(null)
              setDropAt(null)
            }}
            onClick={() => selectSlide(index)}
          >
            <span className="slide-number">{index + 1}</span>
            <div className="slide-thumb">
              <SlideView slide={slide} theme={theme} scale={scale} />
            </div>
            <div className="slide-item-actions">
              <button
                type="button"
                title="このスライドを複製"
                onClick={(event) => {
                  event.stopPropagation()
                  duplicateSlide(index)
                }}
              >
                複製
              </button>
              <button
                type="button"
                title="このスライドを削除"
                onClick={(event) => {
                  event.stopPropagation()
                  deleteSlide(index)
                }}
              >
                削除
              </button>
            </div>
          </li>
        ))}
        {/* タッチ操作ではリボンまで戻らずに増やせるよう、帯の末尾に追加タイルを置く */}
        {compact && (
          <li className="slide-list-add">
            <button
              type="button"
              aria-label="スライドを追加"
              title="スライドを追加"
              onClick={() => addSlide(lastLayoutId ?? DEFAULT_LAYOUT_ID)}
            >
              <Icon name="newSlide" size={18} />
              <span>追加</span>
            </button>
          </li>
        )}
      </ol>
    </aside>
  )
}
