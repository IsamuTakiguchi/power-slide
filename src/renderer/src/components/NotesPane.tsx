/** 下部のスピーカーノート欄。発表者モードで表示される文章。 */
import { useDeckStore } from '../store/deckStore'

export function NotesPane() {
  const notes = useDeckStore((state) => state.deck.slides[state.slideIndex]?.notes ?? '')
  const slideIndex = useDeckStore((state) => state.slideIndex)
  const setNotes = useDeckStore((state) => state.setNotes)

  return (
    <section className="notes-pane">
      <label className="notes-label" htmlFor="speaker-notes">
        スピーカーノート（{slideIndex + 1} 枚目）
      </label>
      <textarea
        id="speaker-notes"
        value={notes}
        placeholder="発表中に自分だけが見るメモ。スライドには出ません。"
        onChange={(event) => setNotes(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />
    </section>
  )
}
