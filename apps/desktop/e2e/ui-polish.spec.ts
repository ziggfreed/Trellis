/**
 * Remembered panel sizes and history columns (across restarts), the commit
 * box's "Push" option, side-by-side hunks in the Changes view, dark
 * scrollbars, and deleting merged remote branches from the clean-up dialog.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

function repoWithRemote() {
  const remote = join(tempDir(), 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', remote)
  repo.git('push', '-q', '-u', 'origin', 'main')
  return { repo, remote }
}

const sidebar = (window: Page) => window.getByRole('navigation', { name: 'Repository' })
const width = async (window: Page) => (await sidebar(window).boundingBox())!.width

test('remembers panel sizes and history columns after a restart', async () => {
  const repo = createRepo()
  const userData = tempDir()
  let { app, window } = await launch(userData)
  await openRepo(app, window, repo.path)

  // Drag the divider to the right of the sidebar 150px further right.
  const before = await width(window)
  const box = (await sidebar(window).boundingBox())!
  await window.mouse.move(box.x + box.width + 1, box.y + 200)
  await window.mouse.down()
  await window.mouse.move(box.x + box.width + 151, box.y + 200, { steps: 10 })
  await window.mouse.up()
  const after = await width(window)
  expect(after).toBeGreaterThan(before + 100)

  // Turn on the Changes column, turn off the Commit (hash) column.
  await window.getByRole('button', { name: 'Columns' }).click()
  await window.getByRole('menuitemcheckbox', { name: 'Changes' }).click()
  await window.getByRole('menuitemcheckbox', { name: 'Commit', exact: true }).click()
  await window.keyboard.press('Escape')
  const header = window.getByTestId('history-header')
  await expect(header).toContainText('Changes')
  await expect(window.getByTestId('commit-row').first()).toContainText('1 file')
  await app.close()

  // Settings are written as you go; a fresh launch picks them up.
  ;({ app, window } = await launch(userData))
  await expect(sidebar(window)).toBeVisible()
  expect(Math.abs((await width(window)) - after)).toBeLessThan(5)
  await expect(window.getByTestId('history-header')).toContainText('Changes')
  await expect(window.getByTestId('history-header')).not.toContainText('Commit')
  await app.close()
})

test('commits and pushes in one go when "Push" is ticked', async () => {
  const { repo, remote } = repoWithRemote()
  repo.write('new.txt', 'new\n')
  repo.git('add', 'new.txt')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()

  await window.getByRole('checkbox', { name: 'Push' }).check()
  await window.getByLabel('Commit summary').fill('add new file')
  await window.getByRole('button', { name: /and push/ }).click()
  await expect(window.getByText('Pushed to origin/main')).toBeVisible()
  expect(execFileSync('git', ['-C', remote, 'log', '-1', '--format=%s']).toString().trim()).toBe(
    'add new file',
  )
  await app.close()
})

test('shows hunks side by side in the Changes view, and can still stage them', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed title\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByRole('region', { name: 'Unstaged', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'README.md' })
    .click()

  await window.getByRole('button', { name: 'Side-by-side view' }).click()
  const row = window.getByTestId('split-row').first()
  await expect(row).toContainText('# test')
  await expect(row).toContainText('# changed title')

  await window.getByTestId('patch-view').getByRole('button', { name: 'Stage' }).first().click()
  await expect.poll(() => repo.git('diff', '--cached', '--name-only').trim()).toBe('README.md')
  await app.close()
})

test('uses dark scrollbars in the dark theme', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.evaluate(() => document.documentElement.classList.add('dark'))
  expect(await window.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'dark',
  )
  await app.close()
})

test('deletes merged branches on the remote from the clean-up dialog', async () => {
  const { repo, remote } = repoWithRemote()
  repo.git('switch', '-q', '-c', 'feature/done')
  repo.write('f.txt', 'f\n')
  repo.commit('feature')
  repo.git('push', '-q', '-u', 'origin', 'feature/done')
  repo.git('switch', '-q', 'main')
  repo.git('merge', '-q', '--no-ff', '-m', 'merge feature', 'feature/done')
  repo.git('push', '-q', 'origin', 'main')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await sidebar(window).getByRole('button', { name: 'Clean up branches…' }).click()
  const dialog = window.getByTestId('prune-dialog')
  const remoteSection = dialog.locator('[data-group="remote"]')
  const remoteBox = remoteSection.getByRole('checkbox', { name: 'origin/feature/done' })
  await expect(remoteBox).not.toBeChecked()
  await remoteBox.check()
  await dialog.getByRole('button', { name: 'Delete 1 local + 1 remote' }).click()
  await window
    .getByRole('dialog', { name: /on the remote/ })
    .getByRole('button', { name: 'Delete', exact: true })
    .click()

  await expect(window.getByText('Deleted 1 branch on origin')).toBeVisible()
  const remoteBranches = execFileSync('git', ['-C', remote, 'branch', '--format=%(refname:short)'])
  expect(remoteBranches.toString().trim()).toBe('main')
  expect(repo.git('branch', '--format=%(refname:short)').trim()).toBe('main')
  await app.close()
})
