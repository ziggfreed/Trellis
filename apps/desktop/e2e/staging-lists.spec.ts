/**
 * The Changes view's two lists (Staged above Unstaged): moving files
 * between them with buttons, multi-select and drag and drop, stashing
 * just some files, and discarding staged files.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

const list = (window: Page, name: 'Staged' | 'Unstaged') =>
  window.getByRole('region', { name, exact: true })
const row = (window: Page, name: 'Staged' | 'Unstaged', file: string) =>
  list(window, name).getByRole('listitem').filter({ hasText: file })

/** A repo with three changed files, opened on the Changes view. */
async function openWithChanges() {
  const repo = createRepo()
  for (const name of ['a.txt', 'b.txt', 'c.txt']) repo.write(name, `${name}\n`)
  repo.commit('three files')
  for (const name of ['a.txt', 'b.txt', 'c.txt']) repo.write(name, `${name} changed\n`)
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  return { repo, app, window }
}

const staged = (repo: { git: (...a: string[]) => string }) =>
  repo.git('diff', '--cached', '--name-only').trim().split('\n').filter(Boolean)

test('shows Staged above Unstaged, both always visible', async () => {
  const { repo, app, window } = await openWithChanges()
  await expect(list(window, 'Staged')).toContainText('Nothing staged yet')
  await expect(list(window, 'Unstaged').getByRole('listitem')).toHaveCount(3)
  const stagedBox = (await list(window, 'Staged').boundingBox())!
  const unstagedBox = (await list(window, 'Unstaged').boundingBox())!
  expect(stagedBox.y).toBeLessThan(unstagedBox.y)

  await list(window, 'Unstaged').getByRole('button', { name: 'Stage all' }).click()
  await expect(list(window, 'Staged').getByRole('listitem')).toHaveCount(3)
  expect(staged(repo)).toEqual(['a.txt', 'b.txt', 'c.txt'])
  await list(window, 'Staged').getByRole('button', { name: 'Unstage all' }).click()
  await expect.poll(() => staged(repo)).toEqual([])
  await app.close()
})

test('stages several files at once with Ctrl/Cmd+click and Shift+click', async () => {
  const { repo, app, window } = await openWithChanges()
  await row(window, 'Unstaged', 'a.txt')
    .getByRole('button', { name: /a\.txt/ })
    .click()
  await row(window, 'Unstaged', 'c.txt')
    .getByRole('button', { name: /c\.txt/ })
    .click({ modifiers: ['ControlOrMeta'] })
  await expect(list(window, 'Unstaged').getByTestId('selection-count')).toHaveText('· 2 selected')
  await list(window, 'Unstaged').getByRole('button', { name: 'Stage selected' }).click()
  await expect.poll(() => staged(repo)).toEqual(['a.txt', 'c.txt'])

  // The moved files stay selected in the Staged list; Shift+click picks a range there too.
  await expect(list(window, 'Staged').getByTestId('selection-count')).toHaveText('· 2 selected')
  await list(window, 'Staged').getByRole('button', { name: 'Unstage selected' }).click()
  await expect.poll(() => staged(repo)).toEqual([])
  await row(window, 'Unstaged', 'a.txt')
    .getByRole('button', { name: /a\.txt/ })
    .click()
  await row(window, 'Unstaged', 'b.txt')
    .getByRole('button', { name: /b\.txt/ })
    .click({ modifiers: ['Shift'] })
  await list(window, 'Unstaged').getByRole('button', { name: 'Stage selected' }).click()
  await expect.poll(() => staged(repo)).toEqual(['a.txt', 'b.txt'])
  await app.close()
})

test('drags selected files from Unstaged to Staged and back', async () => {
  const { repo, app, window } = await openWithChanges()
  await row(window, 'Unstaged', 'a.txt')
    .getByRole('button', { name: /a\.txt/ })
    .click()
  await row(window, 'Unstaged', 'b.txt')
    .getByRole('button', { name: /b\.txt/ })
    .click({ modifiers: ['ControlOrMeta'] })
  await row(window, 'Unstaged', 'b.txt').dragTo(list(window, 'Staged'))
  await expect.poll(() => staged(repo)).toEqual(['a.txt', 'b.txt'])

  await row(window, 'Staged', 'a.txt')
    .getByRole('button', { name: /a\.txt/ })
    .click()
  await row(window, 'Staged', 'a.txt').dragTo(list(window, 'Unstaged'))
  await expect.poll(() => staged(repo)).toEqual(['b.txt'])
  await app.close()
})

test('stashes just the selected files, keeping the rest', async () => {
  const { repo, app, window } = await openWithChanges()
  await row(window, 'Unstaged', 'a.txt').getByRole('button', { name: 'Stage' }).click()
  await expect.poll(() => staged(repo)).toEqual(['a.txt'])

  await row(window, 'Unstaged', 'b.txt')
    .getByRole('button', { name: /b\.txt/ })
    .click()
  await row(window, 'Unstaged', 'c.txt')
    .getByRole('button', { name: /c\.txt/ })
    .click({ modifiers: ['ControlOrMeta'] })
  await list(window, 'Unstaged').getByRole('button', { name: 'Stash selected' }).click()
  const dialog = window.getByRole('dialog')
  await dialog.getByRole('textbox').fill('for later')
  await dialog.getByRole('button', { name: 'Stash' }).click()

  await expect(window.getByText('Stashed 2 files')).toBeVisible()
  expect(repo.git('status', '--porcelain').trim()).toBe('M  a.txt')
  expect(repo.git('stash', 'list')).toContain('for later')
  await app.close()
})

test('discards staged files back to the last commit, and undo brings them back', async () => {
  const { repo, app, window } = await openWithChanges()
  repo.write('new.txt', 'new\n')
  await expect(row(window, 'Unstaged', 'new.txt')).toBeVisible()
  await list(window, 'Unstaged').getByRole('button', { name: 'Stage all' }).click()
  await expect(list(window, 'Staged').getByRole('listitem')).toHaveCount(4)

  await list(window, 'Staged').getByRole('button', { name: 'Discard staged changes' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
  await expect.poll(() => repo.git('status', '--porcelain').trim()).toBe('')
  expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a.txt\n')
  expect(existsSync(join(repo.path, 'new.txt'))).toBe(false)

  // Undo brings the changes back, including the new file.
  await window.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => existsSync(join(repo.path, 'new.txt'))).toBe(true)
  expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a.txt changed\n')
  await app.close()
})
