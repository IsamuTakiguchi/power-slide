/**
 * 日本語のアプリメニュー。項目はすべて renderer へ MenuCommand として送り、
 * 実際の処理（保存やスライド操作）は renderer 側の 1 か所に集約する。
 */
import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '@shared/ipc'

export function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const send = (command: MenuCommand) => () => {
    getWindow()?.webContents.send(IPC.menuCommand, command)
  }

  const isMac = process.platform === 'darwin'

  const macAppMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { label: 'Power Slide について', click: send('about') },
            { type: 'separator' },
            { label: 'サービス', role: 'services' },
            { type: 'separator' },
            { label: 'Power Slide を隠す', role: 'hide' },
            { label: 'ほかを隠す', role: 'hideOthers' },
            { label: 'すべてを表示', role: 'unhide' },
            { type: 'separator' },
            { label: 'Power Slide を終了', role: 'quit' },
          ],
        },
      ]
    : []

  const template: MenuItemConstructorOptions[] = [
    ...macAppMenu,
    {
      label: 'ファイル',
      submenu: [
        { label: '新規作成', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: '別名で保存…', accelerator: 'CmdOrCtrl+Shift+S', click: send('saveAs') },
        { type: 'separator' },
        {
          label: '書き出し',
          submenu: [
            { label: 'PowerPoint 形式 (.pptx)…', click: send('exportPptx') },
            { label: 'PDF…', click: send('exportPdf') },
            { label: 'PNG 画像（1 枚ずつ）…', click: send('exportPng') },
          ],
        },
        { type: 'separator' },
        isMac ? { label: 'ウインドウを閉じる', role: 'close' } : { label: '終了', role: 'quit' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'やり直す', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
        { type: 'separator' },
        { label: '切り取り', role: 'cut' },
        { label: 'コピー', role: 'copy' },
        { label: '貼り付け', role: 'paste' },
        { label: 'すべて選択', role: 'selectAll' },
        { type: 'separator' },
        { label: '複製', accelerator: 'CmdOrCtrl+D', click: send('duplicate') },
        { label: '削除', click: send('delete') },
      ],
    },
    {
      label: '挿入',
      submenu: [
        { label: '新しいスライド', accelerator: 'CmdOrCtrl+M', click: send('addSlide') },
        { type: 'separator' },
        { label: 'テキストボックス', accelerator: 'CmdOrCtrl+T', click: send('insertText') },
        { label: '画像…', click: send('insertImage') },
      ],
    },
    {
      label: '表示',
      submenu: [
        { label: 'スライドショーを開始', accelerator: 'F5', click: send('present') },
        { type: 'separator' },
        { label: '拡大', role: 'zoomIn' },
        { label: '縮小', role: 'zoomOut' },
        { label: '標準の倍率', role: 'resetZoom' },
        { type: 'separator' },
        { label: '再読み込み', role: 'reload' },
        { label: '開発者ツール', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'ヘルプ',
      submenu: [
        { label: 'Power Slide について', click: send('about') },
        {
          label: 'ソースコード（GitHub）',
          click: () => {
            void shell.openExternal('https://github.com/isamutakiguchi/power-slide')
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
