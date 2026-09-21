/**
 * 画面が使うプラットフォーム API の入口。
 * Electron では preload が公開した `window.api` を、ブラウザではこの中の実装を使う。
 */
import type { PowerSlideApi } from '@shared/api'
import { createWebPlatform } from './web'

/** Electron の中で動いているか（preload が API を公開しているか）。 */
export const isElectron = typeof window !== 'undefined' && window.api !== undefined

export const platform: PowerSlideApi = isElectron ? window.api! : createWebPlatform()
