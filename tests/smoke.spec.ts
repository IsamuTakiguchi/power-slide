/**
 * ビルド済みアプリを実際に起動して、編集・保存・書き出し・発表を通しで確認する。
 *
 * ネイティブダイアログは main プロセス側で差し替える（Playwright の
 * electronApp.evaluate は main プロセスで動くので、`dialog` のメソッドを上書きできる）。
 * これにより、保存も書き出しも本番と同じ経路を通したまま自動化できる。
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const workDir = mkdtempSync(join(tmpdir(), 'power-slide-test-'))
const deckPath = join(workDir, 'deck.pslide')

let app: ElectronApplication
let page: Page

/** main プロセスの dialog を差し替える。返り値を固定して自動操作できるようにする。 */
async function stubSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(async ({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as never
  }, filePath)
}

async function stubOpenDialog(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(async ({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as never
  }, path)
}

/** テスト用の 8x8 市松模様 PNG をつくる（画像挿入の入力に使う）。 */
function writeSamplePng(filePath: string): void {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAF0lEQVR42mNgYGD4//8/FhK7KAQMPh0AXXNfoWyFCAcAAAAASUVORK5CYII='
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
}

/** メッセージボックスを固定のボタンで自動応答させる。 */
async function stubMessageBox(app: ElectronApplication, response: number): Promise<void> {
  await app.evaluate(async ({ dialog }, index) => {
    dialog.showMessageBox = (async () => ({ response: index, checkboxChecked: false })) as never
  }, response)
}

function readDeckFile(filePath: string): { slides: unknown[]; title: string; themeId: string } {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/** pptx（zip）の中の 1 エントリを取り出す。 */
async function readEntry(zipPath: string, entry: string): Promise<string> {
  const { execFileSync } = await import('node:child_process')
  return execFileSync('python3', [
    '-c',
    `import zipfile,sys; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode('utf-8'))`,
    zipPath,
    entry,
  ]).toString()
}

/** PNG の IHDR から幅・高さを読む。 */
function pngSize(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['out/main/index.js', '--no-sandbox', `--user-data-dir=${join(workDir, 'userData')}`],
  })
  page = await app.firstWindow()
  await page.waitForSelector('.app-shell')
})

test.afterAll(async () => {
  // 未保存の変更があると main 側が確認ダイアログを出すので、自動で「閉じる」を選ばせる
  await stubMessageBox(app, 0)
  await app.close()
})

test('起動して既定のタイトルスライドが表示される', async () => {
  await expect(page.locator('.slide-list-item')).toHaveCount(1)
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(2)
  await expect(page.locator('.slide-list-header')).toContainText('1 枚')
})

test('同梱した日本語フォントが読み込まれている', async () => {
  // file:// + CSP の下でも同梱フォントが使えることを確かめる。
  // 読み込めていないと OS 標準フォントに落ち、環境ごとに見た目が変わってしまう。
  const loaded = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Noto Sans JP"'),
      document.fonts.load('700 16px "Noto Sans JP"'),
      document.fonts.load('16px "Noto Serif JP"'),
    ])
    return {
      sans: document.fonts.check('16px "Noto Sans JP"'),
      sansBold: document.fonts.check('700 16px "Noto Sans JP"'),
      serif: document.fonts.check('16px "Noto Serif JP"'),
    }
  })
  expect(loaded).toEqual({ sans: true, sansBold: true, serif: true })
})

test('スライドと要素を追加できる', async () => {
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)

  const before = await page.locator('.canvas-stage .slide-element').count()
  await page.getByRole('button', { name: 'テキストボックス', exact: true }).click()
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(before + 1)

  // 追加した要素が選択され、作業ウィンドウに位置とサイズが出る
  await expect(page.locator('.inspector')).toContainText('位置とサイズ')
})

test('レイアウト一覧から選んでスライドを追加できる', async () => {
  await page.getByRole('button', { name: 'スライドのレイアウトを選ぶ' }).click()
  // 2 段組み＝タイトル + 本文 2 つ。ここで選んだレイアウトが以降の「新しいスライド」の既定になる
  await page.getByRole('menuitem', { name: '2 段組み' }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(3)
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(3)
  // 枚数を前提にしたテストが後ろにあるので、追加した分は消しておく
  await page.getByRole('button', { name: '削除', exact: true }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)
})

test('デザインタブのテーマを切り替えるとスライドの背景色が変わる', async () => {
  const surface = page.locator('.canvas-stage .slide-surface')
  const lightBackground = await surface.evaluate((node) => getComputedStyle(node).backgroundColor)

  await page.getByRole('tab', { name: 'デザイン' }).click()
  await page.getByRole('radio', { name: 'ネイビー' }).click()
  await expect
    .poll(async () => surface.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(lightBackground)
  await expect(page.locator('.status-bar')).toContainText('ネイビー')

  await page.getByRole('radio', { name: 'ライト' }).click()
  await page.getByRole('tab', { name: 'ホーム' }).click()
})

test('リボンのフォントグループで太字にできる', async () => {
  const target = page.locator('.canvas-stage .slide-element').first()
  await target.click()
  const isBold = () =>
    target.evaluate((node) =>
      Array.from(node.querySelectorAll<HTMLElement>('*')).some(
        (element) => getComputedStyle(element).fontWeight === '700',
      ),
    )
  expect(await isBold()).toBe(false)
  await page.getByRole('button', { name: '太字' }).click()
  await expect.poll(isBold).toBe(true)
  await expect(page.getByRole('button', { name: '太字' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '太字' }).click()
  await expect.poll(isBold).toBe(false)
})

test('ステータスバーでノートの表示とズームを変えられる', async () => {
  await expect(page.locator('.notes-pane')).toHaveCount(1)
  await page.getByRole('button', { name: 'ノート' }).click()
  await expect(page.locator('.notes-pane')).toHaveCount(0)
  await page.getByRole('button', { name: 'ノート' }).click()
  await expect(page.locator('.notes-pane')).toHaveCount(1)

  // 手動ズーム 100% でスライドは論理サイズ（1280px）そのままになる
  await page.getByLabel('ズーム').fill('100')
  await expect(page.locator('.canvas-stage')).toHaveCSS('width', '1280px')
  await expect(page.locator('.zoom-value')).toHaveText('100%')
  // 画面に合わせるに戻すと縮む
  await page.getByRole('button', { name: '画面に合わせる' }).click()
  await expect.poll(() => page.locator('.canvas-stage').evaluate((node) => node.clientWidth)).toBeLessThan(1280)
})

test('テキストをその場で編集して反映される', async () => {
  const target = page.locator('.canvas-stage .slide-element').first()
  await target.dblclick()
  await expect(page.locator('.text-editor')).toBeVisible()

  await page.locator('.text-editor').selectText()
  await page.keyboard.type('自動テストで入力した見出し')
  // フォーカスを外して確定させる
  await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } })

  await expect(page.locator('.canvas-stage')).toContainText('自動テストで入力した見出し')
})

test('保存すると .pslide として書き出され、内容を読み戻せる', async () => {
  await stubSaveDialog(app, deckPath)
  await page.getByRole('button', { name: '保存', exact: true }).click()

  await expect.poll(() => existsSync(deckPath)).toBe(true)
  const saved = readDeckFile(deckPath)
  expect(saved.slides).toHaveLength(2)
  expect(JSON.stringify(saved)).toContain('自動テストで入力した見出し')
  await expect(page.locator('.save-state')).toContainText('保存済み')
})

test('編集すると自動保存でファイルが更新される', async () => {
  const before = readDeckFile(deckPath).slides.length
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()

  // 自動保存は 1.5 秒のデバウンス後に走る
  await expect.poll(() => readDeckFile(deckPath).slides.length, { timeout: 15_000 }).toBe(before + 1)
  await expect(page.locator('.save-state')).toContainText('保存済み')
})

test('アプリ外で書き換えられたファイルを自動保存で上書きしない', async () => {
  // 手で直した状態を再現する
  const handEdited = readDeckFile(deckPath)
  handEdited.title = '手で書き換えたタイトル'
  writeFileSync(deckPath, `${JSON.stringify(handEdited, null, 2)}\n`, 'utf8')
  const stampBefore = statSync(deckPath).mtimeMs

  // 競合ダイアログでは「キャンセル」（index 3）を選ぶ
  await stubMessageBox(app, 3)
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()

  // 自動保存が止まり、ディスク上の手入力は残っている
  await expect(page.locator('.save-state')).toContainText('自動保存 停止中', { timeout: 15_000 })
  expect(readDeckFile(deckPath).title).toBe('手で書き換えたタイトル')
  expect(statSync(deckPath).mtimeMs).toBe(stampBefore)
})

test('ファイルメニューの「最近使ったファイル」に保存したファイルが並ぶ', async () => {
  await page.getByRole('tab', { name: 'ファイル' }).click()
  await expect(page.locator('.file-menu-recent')).toContainText('deck.pslide')
  // Esc で閉じるだけ（クリックすると開いてしまうので、開く操作は最後のテストで行う）
  await page.keyboard.press('Escape')
  await expect(page.locator('.file-menu')).toHaveCount(0)
})

test('図形と画像を挿入できる', async () => {
  const before = await page.locator('.canvas-stage .slide-element').count()

  await page.getByRole('button', { name: '図形', exact: true }).click()
  await page.getByRole('menuitem', { name: '四角形', exact: true }).click()
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(before + 1)
  await expect(page.locator('.canvas-stage svg rect')).toHaveCount(1)

  const imagePath = join(workDir, 'sample.png')
  writeSamplePng(imagePath)
  await stubOpenDialog(app, imagePath)
  await page.getByRole('button', { name: '画像', exact: true }).click()
  await expect(page.locator('.canvas-stage img')).toHaveCount(1)
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(before + 2)
})

test('PowerPoint 形式で書き出せる', async () => {
  const pptxPath = join(workDir, 'deck.pptx')
  await stubSaveDialog(app, pptxPath)

  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('button', { name: 'PowerPoint (.pptx)' }).click()

  await expect.poll(() => existsSync(pptxPath), { timeout: 60_000 }).toBe(true)
  const slideCount = await page.locator('.slide-list-item').count()
  const buffer = readFileSync(pptxPath)
  const text = buffer.toString('latin1')
  // zip であること（PK シグネチャ）と、スライド数ぶんの XML が入っていること
  expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
  for (let index = 1; index <= slideCount; index += 1) {
    expect(text).toContain(`ppt/slides/slide${index}.xml`)
  }
  expect(text).not.toContain(`ppt/slides/slide${slideCount + 1}.xml`)

  // 図形と画像も含まれていること（どのスライドに入っているかは問わない）
  const slideXmls = await Promise.all(
    Array.from({ length: slideCount }, (_, index) =>
      readEntry(pptxPath, `ppt/slides/slide${index + 1}.xml`),
    ),
  )
  const allSlides = slideXmls.join('')
  // 画像は <p:pic> として、図形は塗り付きの矩形として出る
  expect(allSlides).toContain('<p:pic>')
  expect(allSlides).toContain('<a:blip')
  expect(allSlides).toContain('<a:srgbClr val="2563EB"/>')
  expect(text).toContain('ppt/media/image')
})

test('PDF を書き出せる', async () => {
  const pdfPath = join(workDir, 'deck.pdf')
  await stubSaveDialog(app, pdfPath)

  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('button', { name: 'PDF' }).click()

  await expect.poll(() => existsSync(pdfPath), { timeout: 60_000 }).toBe(true)
  const buffer = readFileSync(pdfPath)
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  // スライド枚数ぶんのページがあること
  const slideCount = await page.locator('.slide-list-item').count()
  expect((buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(slideCount)
  // 同梱フォントのサブセットが PDF に埋め込まれていること。
  // 可変フォントに戻すと Chromium は埋め込みをやめて名前の参照だけにするため、
  // フォントのない PC で開くと書体が化ける。この 2 つでその退行を捕まえる。
  const pdfText = buffer.toString('latin1')
  expect(pdfText).toContain('/FontFile')
  expect(pdfText).toMatch(/\/FontName\s*\/[A-Z]{6}\+NotoSansJP-Regular/)
})

test('PNG を 1 枚ずつ書き出せる', async () => {
  const pngDir = join(workDir, 'png')
  mkdirSync(pngDir, { recursive: true })
  await stubOpenDialog(app, pngDir)

  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('button', { name: 'PNG 画像' }).click()

  const slideCount = await page.locator('.slide-list-item').count()
  await expect
    .poll(() => readdirSync(pngDir).filter((name) => name.endsWith('.png')).length, {
      timeout: 90_000,
    })
    .toBe(slideCount)

  for (const name of readdirSync(pngDir).filter((file) => file.endsWith('.png'))) {
    const size = pngSize(join(pngDir, name))
    expect(size).toEqual({ width: 1280, height: 720 })
    // 真っ白な画像なら数 KB に収まるので、実際に描かれていることの目安にする
    expect(statSync(join(pngDir, name)).size).toBeGreaterThan(6_000)
  }
})

test('スライドショーを開始して Esc で戻れる', async () => {
  await page.getByRole('button', { name: 'スライドショー' }).click()
  await expect(page.locator('.presenter')).toBeVisible()
  await expect(page.locator('.presenter-page')).toContainText('/')

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('n')
  await expect(page.locator('.presenter-notes')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.presenter')).toHaveCount(0)
})

test('編集画面のスクリーンショットを残す', async () => {
  await page.screenshot({ path: join(workDir, 'editor.png'), fullPage: false })
  expect(existsSync(join(workDir, 'editor.png'))).toBe(true)
  // 実行後に目視できるようパスを出す
  console.log(`スクリーンショット: ${join(workDir, 'editor.png')}`)
})

test('最近使ったファイルから選ぶとそのファイルを開ける', async () => {
  // 未保存の変更があるので「破棄して続ける」（index 0）を選ばせる
  await stubMessageBox(app, 0)

  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.locator('.file-menu-recent .recent-item').first().click()

  // 直前にディスク側へ手で書き込んだタイトルが読み込まれる
  await expect(page.getByLabel('プレゼンテーション名')).toHaveValue('手で書き換えたタイトル')
  await expect(page.locator('.save-state')).toContainText('保存済み')
})

test('OS からファイルを指定して起動すると、そのファイルを開く', async () => {
  // 関連付け（.pslide のダブルクリック）と同じ経路 = 起動引数でパスを渡す
  const launchDeck = join(workDir, 'launch.pslide')
  writeFileSync(
    launchDeck,
    JSON.stringify(
      {
        schemaVersion: 1,
        title: '起動引数から開いたデッキ',
        themeId: 'navy',
        slides: [
          { id: 'sl_a', layoutId: 'blank', elements: [], notes: '' },
          { id: 'sl_b', layoutId: 'blank', elements: [], notes: '' },
          { id: 'sl_c', layoutId: 'blank', elements: [], notes: '' },
        ],
      },
      null,
      2,
    ),
    'utf8',
  )

  // 二重起動防止の錠は userData ごとなので、別の userData で独立して起動する
  const launched = await electron.launch({
    args: [
      'out/main/index.js',
      '--no-sandbox',
      `--user-data-dir=${join(workDir, 'userData-launch')}`,
      launchDeck,
    ],
  })
  try {
    const launchedPage = await launched.firstWindow()
    await launchedPage.waitForSelector('.app-shell')
    await expect(launchedPage.getByLabel('プレゼンテーション名')).toHaveValue(
      '起動引数から開いたデッキ',
    )
    await expect(launchedPage.locator('.slide-list-item')).toHaveCount(3)
  } finally {
    await launched.evaluate(async ({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never
    })
    await launched.close()
  }
})
