/** 下部のノート欄。発表者モードで表示される文章。ステータスバーの「ノート」で開閉する。 */
import { useDeckStore } from '../store/deckStore'
import { useUiStore } from '../store/uiStore'

export function NotesPane() {
  const notes = useDeckStore((state) => state.deck.slides[state.slideIndex]?.notes ?? '')
  const setNotes = useDeckStore((state) => state.setNotes)
  const open = useUiStore((state) => state.notesOpen)

  if (!open) return null

  return (
    <section className="notes-pane">
      <label className="notes-label" htmlFor="speaker-notes">
        ノート
      </label>
      <textarea
        id="speaker-notes"
        value={notes}
        placeholder="ノートを入力"
        title="発表中に自分だけが見るメモ。スライドには出ません。"
        onChange={(event) => setNotes(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
      />
    </section>
  )
}
