/**
 * Searching the repository sidebar: filtering branches (inside folders),
 * remote branches, tags and stashes, selecting the first match with Enter,
 * clearing with Esc, and the keyboard shortcut.
 */
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

function repoWithManyRefs() {
  const repo = createRepo()
  const remote = join(tempDir(), 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
  for (const name of ['feature/login', 'feature/search', 'fix/login-crash', 'docs']) {
    repo.git('branch', name)
  }
  repo.git('push', '-q', 'origin', 'main', 'feature/search')
  repo.git('tag', 'v1.0-login')
  repo.git('tag', 'v2.0')
  repo.write('notes.txt', 'wip\n')
  repo.git('add', '-A')
  repo.git('stash', 'push', '-m', 'login experiment')
  return repo
}

const sidebar = (window: Page) => window.getByRole('navigation', { name: 'Repository' })
const search = (window: Page) =>
  window.getByRole('textbox', { name: 'Find branches, tags and stashes' })
/** A sidebar row by its label (its accessible name can add a marker such as "local"). */
const item = (window: Page, name: string) =>
  sidebar(window).getByRole('button', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`),
  })

test('filters branches, remotes, tags and stashes as you type', async () => {
  const repo = repoWithManyRefs()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await expect(item(window, 'docs')).toBeVisible()

  await search(window).fill('login')
  // Branches inside closed folders show, with the match highlighted.
  await expect(item(window, 'login')).toBeVisible()
  await expect(item(window, 'login-crash')).toBeVisible()
  await expect(item(window, 'login').locator('mark')).toHaveText('login')
  await expect(item(window, 'docs')).toBeHidden()
  await expect(item(window, 'search')).toBeHidden()
  // Tags and stashes start collapsed but open to show matches; v2.0 doesn't match.
  await expect(item(window, 'v1.0-login')).toBeVisible()
  await expect(item(window, 'v2.0')).toBeHidden()
  await expect(item(window, 'On main: login experiment')).toBeVisible()
  // No remote branch matches, so the Remotes section is hidden.
  await expect(sidebar(window).getByRole('button', { name: /^Remotes/ })).toBeHidden()

  // Every word must match, in any order.
  await search(window).fill('sear feat')
  await expect(item(window, 'search')).toHaveCount(2) // local and origin/feature/search
  await expect(item(window, 'login')).toBeHidden()

  await search(window).fill('nothing-like-this')
  await expect(window.getByTestId('sidebar-no-matches')).toBeVisible()

  // Esc clears the search and everything comes back.
  await search(window).press('Escape')
  await expect(search(window)).toHaveValue('')
  await expect(item(window, 'docs')).toBeVisible()
  await app.close()
})

test('Enter selects the first match; the shortcut focuses the box', async () => {
  const repo = repoWithManyRefs()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await expect(item(window, 'docs')).toBeVisible()

  await window.getByRole('tab', { name: /Changes/ }).click()
  await window.keyboard.press('ControlOrMeta+Shift+F')
  await expect(search(window)).toBeFocused()
  await window.keyboard.type('v1.0')
  await window.keyboard.press('Enter')
  // The tag's commit is selected in the history.
  await expect(window.getByTestId('commit-details')).toContainText('initial commit')
  await app.close()
})
