import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from './components/AppShell'
import { RenderRoute } from './routes/RenderRoute'
import './styles.css'

/** ハッシュでルートを切り替える（file:// でも動くようにするため）。 */
function resolveRoute(): 'render' | 'editor' {
  return window.location.hash.startsWith('#/render') ? 'render' : 'editor'
}

const container = document.getElementById('root')
if (!container) throw new Error('#root が見つかりません')

const route = resolveRoute()

createRoot(container).render(
  route === 'render' ? (
    // 書き出し用ルートは StrictMode の二重実行を避ける（描画完了の通知が二度走らないように）
    <RenderRoute />
  ) : (
    <StrictMode>
      <AppShell />
    </StrictMode>
  ),
)
