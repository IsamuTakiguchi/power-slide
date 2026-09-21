import type { PowerSlideApi } from '../shared/api'
import type { RenderRequest } from '../shared/ipc'

declare global {
  interface Window {
    /** Electron の preload が公開する。Web 版（ブラウザ）では存在しない。 */
    api?: PowerSlideApi
    /** 書き出し用ルートが公開する描画関数（main の executeJavaScript から呼ばれる）。 */
    __psRenderSlide?: (request: RenderRequest) => void
    /** 描画完了を待つ Promise を返す。 */
    __psWhenRendered?: () => Promise<void>
  }
}

export {}
