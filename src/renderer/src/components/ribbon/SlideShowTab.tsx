/** リボン「スライドショー」タブ。 */
import { useUiStore } from '../../store/uiStore'
import { startPresenting } from '../../lib/commands'
import { BigButton, RibbonGroup } from './RibbonParts'

export function SlideShowTab() {
  const notesOpen = useUiStore((state) => state.notesOpen)
  const toggleNotes = useUiStore((state) => state.toggleNotes)

  return (
    <>
      <RibbonGroup label="スライドショーの開始">
        <BigButton
          icon="play"
          label="最初から"
          title="1 枚目からスライドショーを開始（F5）"
          onClick={() => void startPresenting({ fromStart: true })}
        />
        <BigButton
          icon="playCurrent"
          label="現在のスライドから"
          title="選択中のスライドからスライドショーを開始"
          onClick={() => void startPresenting()}
        />
      </RibbonGroup>
      <RibbonGroup label="発表者ツール">
        <BigButton
          icon="notes"
          label="ノート"
          title="下部のノート欄の表示を切り替え"
          active={notesOpen}
          onClick={toggleNotes}
        />
      </RibbonGroup>
    </>
  )
}
