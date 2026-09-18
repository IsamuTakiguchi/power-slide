/**
 * Electron main プロセスのエントリポイント。
 * ウィンドウの生成・メニュー設定・IPC 登録だけを担当する。
 */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import { clearUnsavedChanges, hasUnsavedChanges, registerIpcHandlers } from './ipc'
import { buildMenu } from './menu'
import { loadRendererRoute } from './rendererTarget'
import { setupFileLaunch } from './fileLaunch'

let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#1f232b',
    title: 'Power Slide',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 外部リンクは OS の既定ブラウザで開き、アプリ内には遷移させない
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 未保存のまま閉じようとしたら確認する。
  // renderer の beforeunload ではネイティブダイアログを出せないので main 側で扱う。
  mainWindow.on('close', (event) => {
    const window = mainWindow
    if (!window || !hasUnsavedChanges()) return
    event.preventDefault()
    void dialog
      .showMessageBox(window, {
        type: 'question',
        buttons: ['保存せずに閉じる', 'キャンセル'],
        defaultId: 1,
        cancelId: 1,
        title: '保存されていない変更があります',
        message: '保存されていない変更があります。閉じてよろしいですか？',
        noLink: true,
      })
      .then(({ response }) => {
        if (response !== 0) return
        clearUnsavedChanges()
        window.close()
      })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void loadRendererRoute(mainWindow, '/editor')
}

// 二重起動なら、引数を先行プロセスへ渡して自分は終了する
if (!setupFileLaunch(getMainWindow)) {
  app.quit()
}

app.whenReady().then(() => {
  app.setName('Power Slide')
  Menu.setApplicationMenu(buildMenu(getMainWindow))
  registerIpcHandlers(getMainWindow)
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
