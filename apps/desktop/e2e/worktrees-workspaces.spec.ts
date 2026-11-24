/** Worktrees, workspaces with the home-screen dashboard, and settings. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('creates a worktree, opens it in a tab, and removes it', async () => {
  const repo = createRepo()
  const folder = join(tempDir(), 'wt-feature')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: 'New worktree' }).click({ force: true })
  const dialog = window.getByRole('dialog')
  await dialog.getByLabel('Branch', { exact: true }).fill('feature/wt')
  await dialog.getByRole('button', { name: 'Next' }).click()
  await dialog.getByLabel('Folder').fill(folder)
  await window.getByRole('button', { name: 'Create worktree' }).click()

  // The new worktree opens in its own tab, on its own branch.
  await expect(window.getByRole('tab', { name: 'wt-feature' })).toBeVisible()
  await expect(window.getByTestId('status-branch')).toHaveText('feature/wt')
  expect(existsSync(join(folder, 'README.md'))).toBe(true)

  // Remove it from the original repository's sidebar.
  await window.getByRole('tab', { name: /trellis-e2e/ }).click()
  await sidebar.getByRole('button', { name: /Worktrees/ }).click() // expand if collapsed
  const item = sidebar.getByRole('button', { name: /wt-feature/ })
  if (!(await item.isVisible())) await sidebar.getByRole('button', { name: /Worktrees/ }).click()
  await item.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Remove worktree…' }).click()
  await window.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect.poll(() => existsSync(folder)).toBe(false)
  await app.close()
})

test('saves open tabs as a workspace and shows it on the home screen', async () => {
  const a = createRepo()
  const b = createRepo()
  b.write('README.md', '# changed\n')
  const { app, window } = await launch()
  await openRepo(app, window, a.path)
  await window.getByRole('button', { name: 'Home' }).click() // "Open repository" is on the home screen
  await openRepo(app, window, b.path)

  await window.getByRole('button', { name: 'Add repository' }).click()
  await window.getByRole('menuitem', { name: 'Save tabs as workspace…' }).click()
  await window.getByRole('dialog').getByLabel('Name').fill('Work')
  await window.getByRole('button', { name: 'Save workspace' }).click()

  await window.getByRole('button', { name: 'Home' }).click()
  const workspace = window.getByTestId('workspace-Work')
  await expect(workspace.getByRole('listitem')).toHaveCount(2)
  await expect(workspace).toContainText('1 changed') // live status of repo b
  await expect(workspace).toContainText('clean') // repo a

  // Close both tabs, then reopen them all from the workspace.
  const repoTabs = window.getByRole('tab', { name: /trellis-e2e/ })
  while ((await repoTabs.count()) > 0) {
    await repoTabs
      .first()
      .getByRole('button', { name: /^Close/ })
      .click()
  }
  await workspace.getByRole('button', { name: 'Open all' }).click()
  await expect(window.getByRole('tab', { name: /trellis-e2e/ })).toHaveCount(2)
  await app.close()
})

test('changes settings and keeps them', async () => {
  const userData = tempDir()
  const { app, window } = await launch(userData)
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click() // give the window keyboard focus
  await window.keyboard.press('ControlOrMeta+,')
  await window.getByLabel('Fetch in the background').selectOption('30')
  await window.getByLabel('Theme').selectOption('dark')
  await expect(window.locator('html')).toHaveClass(/dark/)
  await app.close()
  const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  expect(saved).toMatchObject({ autoFetchMinutes: 30, theme: 'dark' })
})
