import type { PowerSlideApi } from './index'
import type { RenderRequest } from '../shared/ipc'

declare global {
  interface Window {
    api: PowerSlideApi
    /** 書き出し用ルートが公開する描画関数（main の executeJavaScript から呼ばれる）。 */
    __psRenderSlide?: (request: RenderRequest) => void
    /** 描画完了を待つ Promise を返す。 */
    __psWhenRendered?: () => Promise<void>
  }
}

export {}
