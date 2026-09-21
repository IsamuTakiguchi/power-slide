/** リボン「挿入」タブ。 */
import { insertImage, insertTextBox } from '../../lib/commands'
import { BigButton, RibbonGroup } from './RibbonParts'
import { NewSlideButton, ShapesButton } from './SharedButtons'

export function InsertTab() {
  return (
    <>
      <RibbonGroup label="スライド">
        <NewSlideButton />
      </RibbonGroup>
      <RibbonGroup label="画像">
        <BigButton icon="image" label="画像" title="ファイルから画像を挿入" onClick={() => void insertImage()} />
      </RibbonGroup>
      <RibbonGroup label="図">
        <ShapesButton />
      </RibbonGroup>
      <RibbonGroup label="テキスト">
        <BigButton icon="textBox" label="テキストボックス" onClick={insertTextBox} />
      </RibbonGroup>
    </>
  )
}
