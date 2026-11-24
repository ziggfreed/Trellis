/**
 * Phase 3 flows: staging (files, hunks and lines), committing, discarding,
 * branches, merge conflicts, stashes, pushing, the command palette and the
 * git command log.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

const lines = (n: number, changed: Record<number, string> = {}) =>
  Array.from({ length: n }, (_, i) => changed[i + 1] ?? `line ${i + 1}`).join('\n') + '\n'

async function showChanges(window: Page) {
  await window.getByRole('tab', { name: /Changes/ }).click()
}

/** The changes-list row (li) for a file in a section ("Staged", "Unstaged"...). */
function fileRow(window: Page, section: string, file: string) {
  // exact: "Staged" must not also match "Unstaged".
  return window
    .getByRole('region', { name: section, exact: true })
    .getByRole('listitem')
    .filter({ hasText: file })
}

test('stages a file and commits it', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await showChanges(window)

  await fileRow(window, 'Unstaged', 'README.md').hover()
  await fileRow(window, 'Unstaged', 'README.md').getByRole('button', { name: 'Stage' }).click()
  await expect(fileRow(window, 'Staged', 'README.md')).toBeVisible()

  await window.getByLabel('Commit summary').fill('Update readme')
  await window.getByLabel('Commit description').fill('With more detail')
  await window.getByLabel('Commit summary').press('Control+Enter')
  await expect(window.getByText('Your working tree is clean')).toBeVisible()
  expect(repo.git('log', '-1', '--format=%B').trim()).toBe('Update readme\n\nWith more detail')
  await app.close()
})

test('stages selected lines from one hunk only', async () => {
  const repo = createRepo()
  repo.write('f.txt', lines(20))
  repo.commit('add f')
  repo.write('f.txt', lines(20, { 2: 'CHANGED 2', 15: 'CHANGED 15' }))

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await showChanges(window)
  await fileRow(window, 'Unstaged', 'f.txt')
    .getByRole('button', { name: /f\.txt/ })
    .click()

  // Select the added line in the second hunk and stage just that line.
  await window
    .getByTestId('patch-view')
    .getByRole('checkbox', { name: /CHANGED 15/ })
    .click()
  await expect(window.getByText('1 line selected')).toBeVisible()
  await window.getByTestId('patch-view').getByRole('button', { name: 'Stage' }).first().click()

  await expect(fileRow(window, 'Staged', 'f.txt')).toBeVisible()
  await expect(fileRow(window, 'Unstaged', 'f.txt')).toBeVisible()
  // Only the "+CHANGED 15" line is staged; "line 15" is kept alongside it.
  expect(repo.git('show', ':f.txt')).toBe(lines(20).replace('line 15\n', 'line 15\nCHANGED 15\n'))
  await app.close()
})

test('discards changes after confirming', async () => {
  const repo = createRepo()
  repo.write('README.md', '# oops\n')
  repo.write('junk.txt', 'junk\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await showChanges(window)

  await window.getByRole('region', { name: 'Unstaged', exact: true }).hover()
  await window.getByRole('button', { name: 'Discard all' }).click()
  await expect(window.getByRole('dialog')).toContainText('can’t be undone')
  await window.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(window.getByText('Your working tree is clean')).toBeVisible()
  expect(readFileSync(join(repo.path, 'README.md'), 'utf8')).toBe('# test\n')
  await app.close()
})

test('creates a branch from the toolbar and switches to it', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByRole('button', { name: 'Branch', exact: true }).click()
  const name = window.getByLabel('Branch name')
  await name.fill('bad name')
  await expect(window.getByText('Names can’t contain spaces.')).toBeVisible()
  await name.fill('feature/login')
  await window.getByRole('button', { name: 'Create branch' }).click()
  await expect(window.getByTestId('status-branch')).toHaveText('feature/login')
  await app.close()
})

test('a conflicting merge shows the banner and can be aborted', async () => {
  const repo = createRepo()
  repo.git('switch', '-c', 'other')
  repo.write('README.md', 'other\n')
  repo.commit('other change')
  repo.git('switch', 'main')
  repo.write('README.md', 'main\n')
  repo.commit('main change')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: 'other' }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Merge into current branch…' }).click()
  await window.getByRole('button', { name: 'Merge', exact: true }).click()

  const banner = window.getByTestId('operation-banner')
  await expect(banner).toContainText('Merge in progress')
  await expect(banner).toContainText('1 file has conflicts')
  await banner.getByRole('button', { name: 'Abort' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Abort' }).click()
  await expect(banner).toBeHidden()
  expect(repo.git('status', '--porcelain')).toBe('')
  await app.close()
})

test('stashes changes and pops them back', async () => {
  const repo = createRepo()
  repo.write('README.md', '# work in progress\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByRole('button', { name: 'Stash', exact: true }).click()
  await window.getByLabel('Message (optional)').fill('half done')
  await window.getByRole('dialog').getByRole('button', { name: 'Stash' }).click()
  await showChanges(window)
  await expect(window.getByText('Your working tree is clean')).toBeVisible()

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: /Stashes/ }).click() // expand
  await sidebar.getByRole('button', { name: /half done/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Apply and remove (pop)' }).click()
  await expect(fileRow(window, 'Unstaged', 'README.md')).toBeVisible()
  expect(repo.git('stash', 'list')).toBe('')
  await app.close()
})

test('pushes a new branch to the remote and sets its upstream', async () => {
  const remote = join(tempDir(), 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', remote)

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('button', { name: 'Push', exact: true }).click()
  await expect(window.getByText('Pushed to origin/main')).toBeVisible()
  expect(repo.git('rev-parse', '--abbrev-ref', 'main@{upstream}').trim()).toBe('origin/main')
  await app.close()
})

test('runs commands from the palette and lists them in the git log', async () => {
  const repo = createRepo()
  repo.write('new.txt', 'hello\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.keyboard.press('ControlOrMeta+k')
  // Wait for the palette's search box, so no typed characters are lost on slow machines.
  await window.getByPlaceholder('Type a command…').fill('stage all')
  await window.keyboard.press('Enter')
  await showChanges(window)
  await expect(fileRow(window, 'Staged', 'new.txt')).toBeVisible()

  await window.getByRole('button', { name: 'Git log' }).click()
  await expect(window.getByTestId('command-log')).toContainText('git add -A -- new.txt')
  await app.close()
})
