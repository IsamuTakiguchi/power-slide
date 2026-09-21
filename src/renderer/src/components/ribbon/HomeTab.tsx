/** リボン「ホーム」タブ。スライド・フォント・段落・図形描画。 */
import { useDeckStore } from '../../store/deckStore'
import { insertImage, insertTextBox } from '../../lib/commands'
import { FontGroup, ParagraphGroup } from './FontGroup'
import { BigButton, RibbonGroup, SmallButton, SmallStack } from './RibbonParts'
import { NewSlideButton, ShapesButton } from './SharedButtons'

export function HomeTab() {
  const duplicateSlide = useDeckStore((state) => state.duplicateSlide)
  const deleteSlide = useDeckStore((state) => state.deleteSlide)
  const slideCount = useDeckStore((state) => state.deck.slides.length)
  const hasSelection = useDeckStore((state) => state.selectedIds.length > 0)
  const reorderSelected = useDeckStore((state) => state.reorderSelected)
  const deleteSelected = useDeckStore((state) => state.deleteSelected)

  return (
    <>
      <RibbonGroup label="スライド">
        <NewSlideButton />
        <SmallStack>
          <SmallButton icon="duplicate" label="複製" title="このスライドを複製" onClick={() => duplicateSlide()} />
          <SmallButton
            icon="trash"
            label="削除"
            title="このスライドを削除"
            disabled={slideCount <= 1}
            onClick={() => deleteSlide()}
          />
        </SmallStack>
      </RibbonGroup>

      <FontGroup />
      <ParagraphGroup />

      <RibbonGroup label="図形描画">
        <ShapesButton />
        <BigButton icon="textBox" label="テキストボックス" onClick={insertTextBox} />
        <BigButton icon="image" label="画像" onClick={() => void insertImage()} />
        <SmallStack>
          <SmallButton
            icon="front"
            label="前面へ"
            disabled={!hasSelection}
            onClick={() => reorderSelected('front')}
          />
          <SmallButton
            icon="back"
            label="背面へ"
            disabled={!hasSelection}
            onClick={() => reorderSelected('back')}
          />
          <SmallButton
            icon="trash"
            label="要素を削除"
            disabled={!hasSelection}
            onClick={deleteSelected}
          />
        </SmallStack>
      </RibbonGroup>
    </>
  )
}
