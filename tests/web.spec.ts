/**
 * Web 版（PWA）を実際のブラウザで確認する。PC 幅・タブレット幅・スマホ幅の 3 プロジェクトで
 * 同じテストを走らせ、配置がそれぞれの段階に切り替わることも確かめる。
 *
 * ファイル保存はブラウザによって File System Access API か ダウンロードになるが、
 * 自動テストでは OS のダイアログを扱えないので、API を消してダウンロード側の経路に固定する。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

type Layout = 'desktop' | 'tablet' | 'phone'

/** プロジェクト名から、期待する配置の段階を決める。 */
function layout(): Layout {
  const name = test.info().project.name
  if (name === 'web-mobile') return 'phone'
  if (name === 'web-tablet') return 'tablet'
  return 'desktop'
}

/** ダウンロードした zip（pptx）の中の 1 エントリを文字列で取り出す。 */
function readZipEntry(buffer: Buffer, entry: string): string {
  const file = join(mkdtempSync(join(tmpdir(), 'power-slide-web-')), 'out.zip')
  writeFileSync(file, buffer)
  return execFileSync('python3', [
    '-c',
    `import zipfile,sys; sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode('utf-8'))`,
    file,
    entry,
  ]).toString()
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
  // 自動保存スイッチは既定でオン（保存先が無いうちはブラウザ内に残す）
  const autosave = page.getByRole('switch', { name: '自動保存' })
  await expect(autosave).toBeVisible()
  await expect(autosave).toHaveAttribute('aria-checked', 'true')
  // シート見出しは 1 枚
  await expect(page.locator('.sheet-tab')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: 'シート1' })).toHaveAttribute('aria-selected', 'true')
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
  expect(saved.schemaVersion).toBe(2)
  expect(saved.sheets).toHaveLength(1)
  expect(saved.sheets[0].slides).toHaveLength(2)
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

test('シートを足すと、シートごとに別々のスライドを持てる', async ({ page }) => {
  await page.getByRole('button', { name: '新しいシート' }).click()
  await expect(page.getByRole('tab', { name: 'シート2' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)

  await page.getByRole('tab', { name: 'シート1' }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(1)
  await page.getByRole('tab', { name: 'シート2' }).click()
  await expect(page.locator('.slide-list-item')).toHaveCount(2)
})

test('見出しのメニューからシートの名前・色を変え、確認して削除できる', async ({ page }) => {
  await page.getByRole('button', { name: '新しいシート' }).click()

  // 右クリック（スマホでは長押し）でメニュー
  await page.getByRole('tab', { name: 'シート2' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '名前の変更' }).click()
  await page.getByLabel('シート名').fill('付録')
  await page.getByLabel('シート名').press('Enter')
  await expect(page.getByRole('tab', { name: '付録' })).toBeVisible()

  // 同じ名前は付けられない
  await page.getByRole('tab', { name: 'シート1' }).dblclick()
  await page.getByLabel('シート名').fill('付録')
  await page.getByLabel('シート名').press('Enter')
  await expect(page.locator('.status-toast')).toContainText('すでにあります')
  await page.getByLabel('シート名').press('Escape')
  await expect(page.getByRole('tab', { name: 'シート1' })).toBeVisible()

  await page.getByRole('tab', { name: '付録' }).click({ button: 'right' })
  await page.getByRole('button', { name: '見出しの色 #00b050' }).click()
  await expect(page.getByRole('tab', { name: '付録' })).toHaveClass(/has-color/)

  // 削除は確認してから
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('tab', { name: '付録' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '削除' }).click()
  await expect(page.locator('.sheet-tab')).toHaveCount(1)
})

test('自動保存をオフにすると、ブラウザ内の下書きも残さない', async ({ page }) => {
  const autosave = page.getByRole('switch', { name: '自動保存' })
  await autosave.click()
  await expect(autosave).toHaveAttribute('aria-checked', 'false')

  await page.getByLabel('プレゼンテーション名').fill('残らないはずの下書き')
  await page.getByRole('button', { name: '新しいスライド', exact: true }).click()
  await page.waitForTimeout(2500)

  // 閉じる前の確認は出るが、ここでは閉じて読み直す
  page.once('dialog', (dialog) => void dialog.accept())
  await page.reload()
  await page.waitForSelector('.app-shell')
  await expect(page.getByLabel('プレゼンテーション名')).not.toHaveValue('残らないはずの下書き')
  await expect(page.locator('.slide-list-item')).toHaveCount(1)
  // スイッチの状態は覚えている
  await expect(page.getByRole('switch', { name: '自動保存' })).toHaveAttribute('aria-checked', 'false')
})

test('すべてのシートを PowerPoint にすると、シートがセクションになる', async ({ page }) => {
  await useAsciiTitle(page)
  await page.getByRole('button', { name: '新しいシート' }).click()
  await page.getByRole('tab', { name: 'ファイル' }).click()
  await page.getByRole('radio', { name: /すべてのシート/ }).click()
  const { buffer } = await readDownload(page, () =>
    page.getByRole('button', { name: 'PowerPoint (.pptx)' }).click(),
  )
  const presentation = readZipEntry(buffer, 'ppt/presentation.xml')
  expect(presentation).toContain('name="シート1"')
  expect(presentation).toContain('name="シート2"')
  expect(buffer.toString('latin1')).toContain('ppt/slides/slide2.xml')
})

/** 表を挿入する（挿入タブ → 表 → マス目）。挿入するとすぐ左上のセルに入力できる。 */
async function insertTable(page: Page, rows: number, cols: number): Promise<void> {
  await page.getByRole('tab', { name: '挿入' }).click()
  await page.getByRole('button', { name: /^表/ }).click()
  await page.getByRole('menuitem', { name: `${rows} 行 × ${cols} 列` }).click()
  await expect(page.locator('.table-editor')).toBeVisible()
}

function tableCells(page: Page) {
  return page.locator('.canvas-stage .slide-table td').allTextContents()
}

/** 擬似的な貼り付け（Excel がクリップボードに入れるのと同じ形で渡す）。 */
async function pasteText(page: Page, selector: string, text: string, html = ''): Promise<void> {
  await page.evaluate(
    ({ selector, text, html }) => {
      const data = new DataTransfer()
      data.setData('text/plain', text)
      if (html) data.setData('text/html', html)
      const target = document.querySelector(selector) ?? document
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    },
    { selector, text, html },
  )
}

test('表を挿入すると、Excel と同じキー操作で入力・移動できる', async ({ page }) => {
  await insertTable(page, 2, 3)
  // 「表」タブが開き、数式バーに番地が出る
  await expect(page.getByRole('tab', { name: '表', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.name-box')).toHaveText('A1')

  // そのまま打てば入力、Tab で右へ（行の端では次の行へ）
  await page.keyboard.type('項目')
  await page.keyboard.press('Tab')
  await page.keyboard.type('2025')
  await page.keyboard.press('Tab')
  await page.keyboard.type('2026')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('売上') // 日本語入力で確定した文字と同じ入り方
  await page.keyboard.press('Tab')
  await page.keyboard.type('120')
  await page.keyboard.press('Tab')
  await page.keyboard.type('150')
  // 最後のセルで Tab を押すと行が増える
  await page.keyboard.press('Tab')
  await expect(page.locator('.canvas-stage .slide-table tr')).toHaveCount(3)
  await page.keyboard.type('取り消す文字')
  await page.keyboard.press('Escape')
  expect(await tableCells(page)).toEqual(['項目', '2025', '2026', '売上', '120', '150', '', '', ''])

  // F2 で今の文字に続けて編集し、Enter で確定して下へ
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('F2')
  await page.keyboard.type('0')
  await page.keyboard.press('Enter')
  expect((await tableCells(page))[4]).toBe('1200')

  // Shift＋矢印で範囲を選ぶと、ステータスバーに番地と集計が出る（Excel と同じ）
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.status-address')).toHaveText('B2:C2')
  await expect(page.locator('.status-summary')).toContainText('合計: 1,350')
  await expect(page.locator('.status-cell-mode')).toHaveText('準備完了')

  // Delete で範囲の文字を消し、Ctrl+Z で戻す
  await page.keyboard.press('Delete')
  expect((await tableCells(page)).slice(3, 6)).toEqual(['売上', '', ''])
  await page.keyboard.press('Control+z')
  expect((await tableCells(page)).slice(3, 6)).toEqual(['売上', '1200', '150'])
})

test('数式バーでもセルを編集でき、Enter で次のセルへ進む', async ({ page }) => {
  await insertTable(page, 3, 2)
  const bar = page.getByLabel('セルの内容')
  await bar.click()
  await page.keyboard.insertText('長い説明文')
  await page.keyboard.press('Enter')
  await expect(page.locator('.name-box')).toHaveText('A2')
  if (layout() !== 'desktop') {
    // スマホ・タブレットはバーに残ったまま続けて打てる。◀▲▼▶ でも移動できる
    await page.keyboard.insertText('続けて入力')
    await page.getByRole('button', { name: '右のセル' }).click()
    await expect(page.locator('.name-box')).toHaveText('B2')
    expect(await tableCells(page)).toEqual(['長い説明文', '', '続けて入力', '', '', ''])
  } else {
    expect(await tableCells(page)).toEqual(['長い説明文', '', '', '', '', ''])
  }
})

test('右クリック（長押し）メニューと「表」タブで行・列を増やし、消せる', async ({ page }) => {
  await insertTable(page, 2, 2)
  const box = (await page.locator('.table-editor').boundingBox())!
  await page.locator('.table-editor').click({ button: 'right', position: { x: 10, y: box.height * 0.75 } })
  await expect(page.getByRole('menu', { name: 'セル A2' })).toBeVisible()
  await page.getByRole('menuitem', { name: '下に行を挿入' }).click()
  await expect(page.locator('.canvas-stage .slide-table tr')).toHaveCount(3)

  await page.getByRole('button', { name: '右に列を挿入' }).click()
  await expect(page.locator('.canvas-stage .slide-table tr').first().locator('td')).toHaveCount(3)
  await page.getByRole('button', { name: '列を削除' }).click()
  await expect(page.locator('.canvas-stage .slide-table tr').first().locator('td')).toHaveCount(2)
})

test('Excel でコピーした範囲を貼り付けると表になり、表の範囲は Excel に貼れる形でコピーされる', async ({ page }) => {
  // Excel がクリップボードに入れるタブ区切り（セル内改行や桁区切りは "…" で囲まれる）
  const tsv = '項目\t2025年度\r\n売上\t"1,200"\r\n"費用\n(販管費)"\t800\r\n'
  await pasteText(page, 'body', tsv)
  await expect(page.locator('.canvas-stage .slide-table')).toHaveCount(1)
  expect(await tableCells(page)).toEqual(['項目', '2025年度', '売上', '1,200', '費用\n(販管費)', '800'])
  // 数値は右揃え（Excel と同じ）
  await expect(page.locator('.canvas-stage .slide-table td').nth(3)).toHaveCSS('text-align', 'right')
  await expect(page.getByRole('tab', { name: '表', exact: true })).toBeVisible()

  // 表に入って B2:B3 をコピー → タブ区切りで出る
  await page.locator('.canvas-stage .slide-table').click()
  await expect(page.locator('.table-editor')).toBeVisible()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  const copied = await page.evaluate(() => {
    const data = new DataTransfer()
    document
      .querySelector('.table-cell-input')!
      .dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
    return data.getData('text/plain')
  })
  expect(copied).toBe('1,200\r\n800\r\n')

  // 表の中で貼ると作業セルから広がる（足りない列は増える）
  await pasteText(page, '.table-cell-input', 'x\ty\tz')
  await expect(page.locator('.canvas-stage .slide-table tr').first().locator('td')).toHaveCount(4)
})

test('表は PowerPoint に本物の表として書き出される', async ({ page }) => {
  await useAsciiTitle(page)
  // 名前の欄から離れてスライドを選んでから貼る（入力欄にいるあいだの貼り付けは入力欄に入る）
  await page.locator('.canvas-area').click({ position: { x: 5, y: 5 } })
  await pasteText(page, 'body', 'name\tvalue\r\nalpha\t1\r\n')
  await page.getByRole('tab', { name: 'ファイル' }).click()
  const { buffer } = await readDownload(page, () =>
    page.getByRole('button', { name: 'PowerPoint (.pptx)' }).click(),
  )
  const slide = readZipEntry(buffer, 'ppt/slides/slide1.xml')
  expect(slide).toContain('<a:tbl>')
  expect(slide).toContain('alpha')
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
