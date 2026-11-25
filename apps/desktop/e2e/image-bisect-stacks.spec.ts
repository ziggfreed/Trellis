/** Image diffs, the bisect assistant and stacked branches. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

/** A tiny solid-colour PNG, built by hand (no image library needed). */
function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (data: Buffer) => {
    let c = 0xffffffff
    for (const byte of data) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill([r, g, b]).flat())])
  const pixels = deflateSync(Buffer.concat(Array(height).fill(row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function runCommand(window: Page, name: string) {
  await window.keyboard.press('ControlOrMeta+k')
  await window.getByPlaceholder('Type a command…').fill(name)
  await window
    .getByRole('option', { name: new RegExp(name) })
    .first()
    .click()
}

test('compares two versions of an image side by side, by swiping and as onion skin', async () => {
  const repo = createRepo()
  writeFileSync(join(repo.path, 'logo.png'), solidPng(4, 3, [255, 0, 0]))
  repo.commit('add logo')
  writeFileSync(join(repo.path, 'logo.png'), solidPng(8, 6, [0, 0, 255]))
  repo.commit('bigger blue logo')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByTestId('commit-row').filter({ hasText: 'bigger blue logo' }).click()
  await window.getByRole('button', { name: /logo\.png/ }).click()
  const view = window.getByTestId('image-diff')
  await expect(view.getByRole('img', { name: 'logo.png, before' })).toBeVisible()
  await expect(view.getByRole('img', { name: 'logo.png, after' })).toBeVisible()
  await expect(view).toContainText('Before: 4×3')
  await expect(view).toContainText('After: 8×6')

  await view.getByRole('radio', { name: 'Swipe' }).click()
  await view.getByLabel('Swipe position').fill('20')
  await expect(view.getByRole('img', { name: 'logo.png, after' })).toHaveAttribute(
    'style',
    /inset\(0px 80% 0px 0px\)|inset\(0 80% 0 0\)/,
  )
  await view.getByRole('radio', { name: 'Onion skin' }).click()
  await view.getByLabel('Opacity of the new image').fill('30')
  await expect(view.getByRole('img', { name: 'logo.png, after' })).toHaveAttribute(
    'style',
    /opacity: 0.3/,
  )
  await app.close()
})

test('bisects to the first bad commit from the history', async () => {
  const repo = createRepo()
  for (let i = 1; i <= 8; i++) {
    repo.write('value.txt', i >= 6 ? 'broken\n' : 'ok\n') // the bug arrives in commit 6
    repo.write('counter.txt', `${i}\n`)
    repo.commit(`commit ${i}`)
  }
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const row = (subject: string) =>
    window.getByTestId('commit-row').filter({ has: window.getByText(subject, { exact: true }) })

  await row('commit 8').click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Bisect' }).click()
  await window.getByRole('menuitem', { name: /Start: this commit has the bug/ }).click()
  const banner = window.getByTestId('bisect-banner')
  await expect(banner).toContainText('Mark good')

  await row('commit 1').click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Bisect' }).click()
  await window.getByRole('menuitem', { name: /Mark good/ }).click()
  await expect(banner).toContainText('Test the checked-out commit')

  // Play the tester: look at the checked-out commit and answer.
  for (let step = 0; step < 6; step++) {
    if (await banner.getByText('Found it').isVisible()) break
    const head = repo.git('rev-parse', 'HEAD').trim()
    const broken = repo.git('show', 'HEAD:value.txt').trim() === 'broken'
    await banner.getByRole('button', { name: broken ? 'Bad' : 'Good' }).click()
    await expect
      .poll(async () =>
        (await banner.getByText('Found it').isVisible())
          ? 'done'
          : repo.git('rev-parse', 'HEAD').trim(),
      )
      .not.toBe(head)
  }
  await expect(banner).toContainText('“commit 6” is the first bad commit')
  await expect(row('commit 6').getByTestId('bisect-badge')).toHaveText('first bad')

  await banner.getByRole('button', { name: 'Stop bisecting' }).click()
  await expect(banner).toBeHidden()
  expect(repo.git('branch', '--show-current').trim()).toBe('main')
  await app.close()
})

test('rebases a stack of branches onto main in one go', async () => {
  const repo = createRepo()
  repo.git('switch', '-c', 'api')
  repo.write('api.txt', 'api\n')
  repo.commit('api work')
  repo.git('switch', '-c', 'ui')
  repo.write('ui.txt', 'ui\n')
  repo.commit('ui work')
  repo.git('switch', 'main')
  repo.write('main.txt', 'main\n')
  repo.commit('main moves on')
  repo.git('switch', 'ui')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await runCommand(window, 'Branch stack')
  const dialog = window.getByTestId('stack-dialog')
  const stack = dialog.getByRole('list', { name: 'Stack, top first' })
  await expect(stack.getByRole('listitem')).toHaveText([
    /ui\s*1 commit/,
    /api\s*1 commit/,
    /main \(base\)/,
  ])
  await dialog.getByRole('button', { name: 'Rebase stack onto main' }).click()
  await expect(window.getByText('Rebased 2 branches onto main')).toBeVisible()
  const sha = (ref: string) => repo.git('rev-parse', ref).trim()
  expect(sha('api~1')).toBe(sha('main'))
  expect(sha('ui~1')).toBe(sha('api'))
  await app.close()
})
