/**
 * 「ファイル」タブを押したときに出るメニュー（PowerPoint の Backstage の簡略版）。
 * 左にコマンド、右に最近使ったファイル。
 */
import { platform } from '../../platform'
import { useEffect, useState } from 'react'
import type { RecentFile } from '@shared/ipc'
import { exportDeck, newDeck, openDeck, openDeckPath, saveDeck, saveDeckAs } from '../../lib/commands'
import { Icon, type IconName } from '../Icon'

/** パスからファイル名だけを取り出す（Windows の区切りにも対応）。 */
function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: IconName
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button type="button" className="file-menu-item" onClick={onClick}>
      <Icon name={icon} size={22} />
      <span className="file-menu-item-text">
        <span>{label}</span>
        {hint && <span className="file-menu-hint">{hint}</span>}
      </span>
    </button>
  )
}

export function FileMenu({ close }: { close: () => void }) {
  const [files, setFiles] = useState<RecentFile[] | null>(null)

  // 開くたびに読み直す（前回起動で増えている可能性があるため）
  useEffect(() => {
    void platform.deck.recent().then(setFiles)
  }, [])

  const run = (action: () => unknown) => () => {
    close()
    void action()
  }

  return (
    <div className="file-menu" role="menu" aria-label="ファイル">
      <div className="file-menu-commands">
        <MenuItem icon="newFile" label="新規" hint="Ctrl+N" onClick={run(newDeck)} />
        <MenuItem icon="folderOpen" label="開く" hint="Ctrl+O" onClick={run(openDeck)} />
        <MenuItem icon="save" label="保存" hint="Ctrl+S" onClick={run(saveDeck)} />
        <MenuItem icon="save" label="名前を付けて保存" hint="Ctrl+Shift+S" onClick={run(saveDeckAs)} />
        <div className="file-menu-section">エクスポート</div>
        <MenuItem
          icon="export"
          label="PowerPoint (.pptx)"
          hint="PowerPoint で開ける形式"
          onClick={run(() => exportDeck('pptx'))}
        />
        <MenuItem
          icon="export"
          label="PDF"
          hint={platform.capabilities.nativeFiles ? '配布・印刷用' : 'ブラウザの印刷から「PDF に保存」'}
          onClick={run(() => exportDeck('pdf'))}
        />
        {platform.capabilities.exportPng && (
          <MenuItem
            icon="export"
            label="PNG 画像"
            hint="スライドごとに 1 枚"
            onClick={run(() => exportDeck('png'))}
          />
        )}
      </div>
      <div className="file-menu-recent">
        <div className="file-menu-section">最近使ったファイル</div>
        {files === null && <span className="dropdown-note">読み込み中…</span>}
        {files?.length === 0 && <span className="dropdown-note">まだ履歴がありません</span>}
        {files?.map((file) => (
          <button
            key={file.filePath}
            type="button"
            className="recent-item"
            title={file.filePath}
            onClick={run(() => openDeckPath(file.filePath))}
          >
            <Icon name="appLogo" size={20} />
            <span className="recent-text">
              <span className="recent-title">{file.title || fileName(file.filePath)}</span>
              <span className="recent-path">{fileName(file.filePath)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
