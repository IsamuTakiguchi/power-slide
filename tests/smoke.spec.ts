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

test('スライドと要素を追加できる', async () => {
  await page.getByRole('button', { name: 'スライドを追加' }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)

  const before = await page.locator('.canvas-stage .slide-element').count()
  await page.getByRole('button', { name: 'テキスト', exact: true }).click()
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(before + 1)

  // 追加した要素が選択され、インスペクタに位置とサイズが出る
  await expect(page.locator('.inspector')).toContainText('位置とサイズ')
})

test('テーマを切り替えるとスライドの背景色が変わる', async () => {
  const surface = page.locator('.canvas-stage .slide-surface')
  const lightBackground = await surface.evaluate((node) => getComputedStyle(node).backgroundColor)

  await page.getByLabel('テーマ', { exact: true }).selectOption('navy')
  await expect
    .poll(async () => surface.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(lightBackground)

  await page.getByLabel('テーマ', { exact: true }).selectOption('light')
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
  await page.getByRole('button', { name: 'スライドを追加' }).click()

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
  await page.getByRole('button', { name: 'スライドを追加' }).click()

  // 自動保存が止まり、ディスク上の手入力は残っている
  await expect(page.locator('.save-state')).toContainText('自動保存 停止中', { timeout: 15_000 })
  expect(readDeckFile(deckPath).title).toBe('手で書き換えたタイトル')
  expect(statSync(deckPath).mtimeMs).toBe(stampBefore)
})

test('図形と画像を挿入できる', async () => {
  const before = await page.locator('.canvas-stage .slide-element').count()

  await page.getByRole('button', { name: '図形 ▾' }).click()
  await page.getByRole('button', { name: '四角形', exact: true }).click()
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

  await page.getByRole('button', { name: '書き出し ▾' }).click()
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

  await page.getByRole('button', { name: '書き出し ▾' }).click()
  await page.getByRole('button', { name: 'PDF' }).click()

  await expect.poll(() => existsSync(pdfPath), { timeout: 60_000 }).toBe(true)
  const buffer = readFileSync(pdfPath)
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  // スライド枚数ぶんのページがあること
  const slideCount = await page.locator('.slide-list-item').count()
  expect((buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(slideCount)
  // フォントが埋め込まれている = 文字が実際に描かれている
  expect(buffer.toString('latin1')).toContain('/FontFile')
})

test('PNG を 1 枚ずつ書き出せる', async () => {
  const pngDir = join(workDir, 'png')
  mkdirSync(pngDir, { recursive: true })
  await stubOpenDialog(app, pngDir)

  await page.getByRole('button', { name: '書き出し ▾' }).click()
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
