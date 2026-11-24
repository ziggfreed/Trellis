/**
 * Undo and redo through the UI: toolbar buttons, keyboard shortcuts and
 * the Redo button in the toast.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('undoes and redoes a commit', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed\n')
  repo.git('add', '.')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByRole('tab', { name: /Changes/ }).click()
  // Committing does nothing until the staged file has loaded, so wait for it.
  const staged = window.getByRole('region', { name: 'Staged', exact: true })
  await expect(staged).toContainText('README.md')
  await window.getByLabel('Commit summary').fill('Change readme')
  await window.getByLabel('Commit summary').press('Control+Enter')
  await expect(window.getByText('Your working tree is clean')).toBeVisible()

  // Ctrl+Z undoes text while typing, so move focus out of the text box first.
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await window.keyboard.press('ControlOrMeta+z')
  await expect(window.getByText('Undone: Commit “Change readme”')).toBeVisible()
  await expect(window.getByRole('region', { name: 'Staged', exact: true })).toContainText(
    'README.md',
  )
  expect(repo.git('log', '--format=%s')).toBe('initial commit\n')

  await window.getByRole('button', { name: 'Redo', exact: true }).first().click()
  await expect(window.getByText('Your working tree is clean')).toBeVisible()
  expect(repo.git('log', '-1', '--format=%s').trim()).toBe('Change readme')
  await app.close()
})

test('brings back discarded files', async () => {
  const repo = createRepo()
  repo.write('README.md', '# precious\n')
  repo.write('draft.txt', 'untracked draft\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByRole('tab', { name: /Changes/ }).click()
  await window.getByRole('region', { name: 'Unstaged', exact: true }).hover()
  await window.getByRole('button', { name: 'Discard all' }).click()
  await window.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(window.getByText('Your working tree is clean')).toBeVisible()
  expect(existsSync(join(repo.path, 'draft.txt'))).toBe(false)

  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(window.getByRole('region', { name: 'Unstaged', exact: true })).toContainText(
    'draft.txt',
  )
  expect(readFileSync(join(repo.path, 'README.md'), 'utf8')).toBe('# precious\n')
  expect(readFileSync(join(repo.path, 'draft.txt'), 'utf8')).toBe('untracked draft\n')
  await app.close()
})
