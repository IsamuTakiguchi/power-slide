/**
 * Web 版（PWA）を実際のブラウザで確認する。PC 幅・タブレット幅・スマホ幅の 3 プロジェクトで
 * 同じテストを走らせ、配置がそれぞれの段階に切り替わることも確かめる。
 *
 * ファイル保存はブラウザによって File System Access API か ダウンロードになるが、
 * 自動テストでは OS のダイアログを扱えないので、API を消してダウンロード側の経路に固定する。
 */
import { expect, test, type Page } from '@playwright/test'

type Layout = 'desktop' | 'tablet' | 'phone'

/** プロジェクト名から、期待する配置の段階を決める。 */
function layout(): Layout {
  const name = test.info().project.name
  if (name === 'web-mobile') return 'phone'
  if (name === 'web-tablet') return 'tablet'
  return 'desktop'
}

async function readDownload(page: Page, action: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()])
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return { name: download.suggestedFilename(), buffer: Buffer.concat(chunks) }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as unknown as Record<string, unknown>
    delete target.showSaveFilePicker
    delete target.showOpenFilePicker
    // PDF は印刷ダイアログに渡すので、呼ばれたことだけ記録する
    window.print = () => {
      document.title = 'PRINT-CALLED'
    }
  })
  await page.goto('./')
  await page.waitForSelector('.app-shell')
})

test('ブラウザで起動してタイトルスライドが出る', async ({ page }) => {
  await expect(page.locator('.slide-list-item')).toHaveCount(1)
  await expect(page.locator('.canvas-stage .slide-element')).toHaveCount(2)
  // Electron ではないので、下書きをブラウザに残すモードになっている
  await expect(page.locator('.autosave')).toHaveText(/下書き/)
  // PNG 書き出しは Web 版に無い
  await page.getByRole('tab', { name: 'ファイル' }).click()
  await expect(page.getByRole('button', { name: 'PowerPoint (.pptx)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PNG 画像' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('画面幅に応じて配置が 3 段階に変わる', async ({ page }) => {
  const shell = page.locator('.app-shell')
  const kind = layout()

  if (kind === 'desktop') {
    await expect(shell).not.toHaveClass(/is-compact/)
    // リボンはグループ名付きの 2 段組み、書式設定は右のペイン
    await expect(page.locator('.ribbon-group-label').first()).toBeVisible()
    await expect(page.locator('.task-pane')).toBeVisible()
    const list = await page.locator('.slide-list').boundingBox()
    expect(list!.width).toBeGreaterThan(200)
    return
  }

  // タブレット・スマホ共通: リボンは 1 行のボタン列、書式設定は下から出るシート
  await expect(shell).toHaveClass(/is-compact/)
  await expect(page.locator('.ribbon-group-label').first()).toBeHidden()
  const ribbon = await page.locator('.ribbon-body').boundingBox()
  expect(ribbon!.height).toBeLessThan(70)
  await expect(page.locator('.task-pane')).toHaveCount(0)
  // ステータスバーの「書式」でシートとして開き、背景のタップで閉じる
  await page.getByRole('button', { name: '書式' }).click()
  await expect(page.locator('.task-pane')).toBeVisible()
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } })
  await expect(page.locator('.task-pane')).toHaveCount(0)

  const list = (await page.locator('.slide-list').boundingBox())!
  if (kind === 'phone') {
    await expect(shell).toHaveClass(/is-phone/)
    // スライド一覧は下の帯（横並び）
    expect(list.height).toBeLessThan(120)
    expect(list.width).toBeGreaterThan(300)
    // リボンは親指の届く下側、キャンバスより下に出る
    const canvas = (await page.locator('.canvas-area').boundingBox())!
    const ribbonBox = (await page.locator('.ribbon').boundingBox())!
    expect(ribbonBox.y).toBeGreaterThan(canvas.y)
  } else {
    await expect(shell).not.toHaveClass(/is-phone/)
    // タブレットでは一覧は縦のまま、幅だけ細くする
    expect(list.height).toBeGreaterThan(300)
    expect(list.width).toBeLessThan(200)
  }
})

test('狭い画面ではスライド一覧から直接追加できる', async ({ page }) => {
  const add = page.getByRole('button', { name: 'スライドを追加' })
  if (layout() === 'desktop') {
    await expect(add).toHaveCount(0)
    return
  }
  await add.click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)
})

test('リボンはたたんでスライドの表示を広げられる', async ({ page }) => {
  await expect(page.locator('.ribbon-body')).toBeVisible()
  await page.getByRole('button', { name: 'リボンを折りたたむ' }).click()
  await expect(page.locator('.ribbon-body')).toHaveCount(0)
  // タブを選び直すと戻る
  await page.getByRole('tab', { name: '挿入' }).click()
  await expect(page.locator('.ribbon-body')).toBeVisible()
  // 選んでいるタブをもう一度押すとたたむ（PowerPoint と同じ）
  await page.getByRole('tab', { name: '挿入' }).click()
  await expect(page.locator('.ribbon-body')).toHaveCount(0)
})

test('テキストは指なら 2 回タップ、マウスならダブルクリックで編集に入る', async ({ page }) => {
  const title = page.locator('.canvas-stage .slide-element').first()

  if (layout() === 'desktop') {
    await title.dblclick()
    await expect(title).toHaveClass(/is-editing/)
    return
  }

  // 1 回目のタップは選択だけ（そのままドラッグで動かせる）
  await title.tap()
  await expect(title).toHaveClass(/is-selected/)
  await expect(title).not.toHaveClass(/is-editing/)
  // 選択済みの要素をもう一度タップすると文字を直せる
  await title.tap()
  await expect(title).toHaveClass(/is-editing/)
})

/**
 * ダウンロード名はプレゼンテーション名から付ける。UTF-8 ロケールの無い CI コンテナでは
 * Chromium が日本語のファイル名を落として "download" と報告するため、ここでは ASCII の名前で確かめる
 * （実際の Chrome / Safari では日本語名でも問題ない）。
 */
async function useAsciiTitle(page: Page): Promise<void> {
  await page.getByLabel('プレゼンテーション名').fill('web-test')
}

test('スライドを追加して保存すると .pslide がダウンロードされる', async ({ page }) => {
  await useAsciiTitle(page)
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)

  const { name, buffer } = await readDownload(page, () =>
    page.getByRole('button', { name: '保存', exact: true }).click(),
  )
  expect(name).toBe('web-test.pslide')
  const saved = JSON.parse(buffer.toString('utf8'))
  expect(saved.slides).toHaveLength(2)
  await expect(page.locator('.save-state')).toContainText('保存済み')
})

test('編集中の内容が下書きとして残り、再読み込みで復元される', async ({ page }) => {
  await page.getByLabel('プレゼンテーション名').fill('下書きの確認')
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  // 自動保存は 1.5 秒のデバウンス後に走る
  await page.waitForTimeout(2500)

  await page.reload()
  await page.waitForSelector('.app-shell')
  await expect(page.getByLabel('プレゼンテーション名')).toHaveValue('下書きの確認')
  await expect(page.locator('.slide-list-item')).toHaveCount(2)
})

test('PowerPoint 形式をブラウザ内で組み立ててダウンロードできる', async ({ page }) => {
  await useAsciiTitle(page)
  await page.getByRole('tab', { name: 'ファイル' }).click()
  const { name, buffer } = await readDownload(page, () =>
    page.getByRole('button', { name: 'PowerPoint (.pptx)' }).click(),
  )
  expect(name).toBe('web-test.pptx')
  expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
  expect(buffer.toString('latin1')).toContain('ppt/slides/slide1.xml')
})

test('PDF はブラウザの印刷に渡す', async ({ page }) => {
  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('button', { name: 'PDF' }).click()
  // 印刷用の iframe が全スライドを描いてから print() を呼ぶ
  await expect
    .poll(async () => {
      const frame = page.frames().find((item) => item !== page.mainFrame())
      return frame ? frame.evaluate(() => document.title).catch(() => '') : ''
    })
    .toBe('PRINT-CALLED')
})

test('スライドショーはタップで送れる', async ({ page }) => {
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  await page.getByRole('button', { name: 'スライドショー' }).click()
  await expect(page.locator('.presenter')).toBeVisible()
  await expect(page.locator('.presenter-page')).toContainText('2 /')

  const stage = page.locator('.presenter-stage')
  const box = (await stage.boundingBox())!
  // 左端 3 割で前へ、それ以外で次へ
  await stage.click({ position: { x: box.width * 0.1, y: box.height / 2 } })
  await expect(page.locator('.presenter-page')).toContainText('1 /')
  await stage.click({ position: { x: box.width * 0.8, y: box.height / 2 } })
  await expect(page.locator('.presenter-page')).toContainText('2 /')

  await page.keyboard.press('Escape')
  await expect(page.locator('.presenter')).toHaveCount(0)
})
