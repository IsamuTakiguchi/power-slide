/**
 * OS からファイルを指定して起動されたときの受け口。
 *
 * ・Windows / Linux … コマンドライン引数で `.pslide` のパスが渡る
 * ・macOS ………………… `open-file` イベントで渡る（起動前に発火することもある）
 *
 * 起動直後は renderer がまだ準備できていないため、いったんここで保持し、
 * renderer 側が起動時に取りに来る（`deck:takePendingOpen`）。
 * すでに起動している場合はイベントとして renderer に送る。
 */
import { app, type BrowserWindow } from 'electron'
import { isAbsolute, resolve } from 'node:path'
import { FILE_EXTENSION } from '@shared/deck'
import { IPC } from '@shared/ipc'

/** renderer がまだ受け取れていない「開いてほしいファイル」。 */
let pendingPath: string | null = null

/** コマンドライン引数から `.pslide` のパスを取り出す。 */
export function pslidePathFromArgv(argv: string[]): string | null {
  const candidate = argv
    .slice(1)
    .find((arg) => !arg.startsWith('-') && arg.toLowerCase().endsWith(`.${FILE_EXTENSION}`))
  if (!candidate) return null
  return isAbsolute(candidate) ? candidate : resolve(candidate)
}

/** renderer が起動時に 1 度だけ取りに来る。取り出したら消す。 */
export function takePendingOpen(): string | null {
  const path = pendingPath
  pendingPath = null
  return path
}

/**
 * 開くファイルを受け付ける。
 * renderer が動いていればそのまま送り、まだなら保持しておく。
 */
function accept(filePath: string, getWindow: () => BrowserWindow | null): void {
  const window = getWindow()
  if (window && !window.webContents.isLoading()) {
    window.webContents.send(IPC.deckOpenRequested, filePath)
    if (window.isMinimized()) window.restore()
    window.focus()
    return
  }
  pendingPath = filePath
}

/**
 * ファイル起動の配線。二重起動は許さず、2 つ目の起動で渡されたパスを
 * 既存ウィンドウに引き渡す（PowerPoint と同じ感覚で使えるようにする）。
 *
 * @returns このプロセスを続行してよければ true。二重起動なら false。
 */
export function setupFileLaunch(getWindow: () => BrowserWindow | null): boolean {
  if (!app.requestSingleInstanceLock()) return false

  // macOS は起動前にも発火するので、whenReady より前に登録しておく
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    accept(filePath, getWindow)
  })

  app.on('second-instance', (_event, argv) => {
    const filePath = pslidePathFromArgv(argv)
    if (filePath) accept(filePath, getWindow)
    else getWindow()?.focus()
  })

  // 1 回目の起動時の引数
  const initial = pslidePathFromArgv(process.argv)
  if (initial) pendingPath = initial

  return true
}
