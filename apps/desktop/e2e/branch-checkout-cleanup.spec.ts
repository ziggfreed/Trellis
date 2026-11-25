/**
 * Double-click to check out (remote branches in the sidebar, commits and
 * branch labels in the history), "local"/"gone" markers on branches that
 * aren't on a remote, and cleaning up squash-merged and abandoned branches.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

/** A repo with a bare "origin" that main is pushed to. */
function repoWithRemote() {
  const remote = join(tempDir(), 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', remote)
  repo.git('push', '-q', '-u', 'origin', 'main')
  return { repo, remote }
}

const currentBranch = (repo: { git: (...args: string[]) => string }) =>
  repo.git('branch', '--show-current').trim()

const sidebar = (window: Page) => window.getByRole('navigation', { name: 'Repository' })

test('double-clicking a remote branch in the sidebar checks it out as a local branch', async () => {
  const { repo, remote } = repoWithRemote()
  // Someone else pushes a branch; we fetch it but have no local copy.
  const other = createRepo()
  other.git('remote', 'add', 'origin', remote)
  other.git('fetch', '-q', 'origin')
  other.git('switch', '-q', '-c', 'their-feature', 'origin/main')
  other.write('theirs.txt', 'theirs\n')
  other.commit('their work')
  other.git('push', '-q', 'origin', 'their-feature')
  repo.git('fetch', '-q', 'origin')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await sidebar(window)
    .getByRole('button', { name: /^their-feature/ })
    .dblclick()
  await expect.poll(() => currentBranch(repo)).toBe('their-feature')
  expect(repo.git('rev-parse', '--abbrev-ref', 'their-feature@{upstream}').trim()).toBe(
    'origin/their-feature',
  )
  await app.close()
})

test('double-clicking a commit in the history checks out its branch', async () => {
  const repo = createRepo()
  repo.git('switch', '-q', '-c', 'feature')
  repo.write('f.txt', 'f\n')
  repo.commit('feature work')
  repo.git('switch', '-q', 'main')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByTestId('commit-row').filter({ hasText: 'feature work' }).dblclick()
  await expect.poll(() => currentBranch(repo)).toBe('feature')

  // A commit with no branch asks before leaving you on no branch.
  repo.write('g.txt', 'g\n')
  repo.commit('second feature commit')
  // Wait for the history to see it AND for the "feature" label to move onto
  // it (refs refresh separately from the commit list), so "feature" no
  // longer points at the first commit.
  await expect(
    window
      .getByTestId('commit-row')
      .filter({ hasText: 'second feature commit' })
      .locator('[data-ref="refs/heads/feature"]'),
  ).toBeVisible()
  const first = window.getByTestId('commit-row').filter({ hasText: 'feature work' })
  await first.dblclick()
  await window.getByRole('dialog').getByRole('button', { name: 'Check out' }).click()
  await expect.poll(() => currentBranch(repo)).toBe('')
  await app.close()
})

test('marks branches that are local only or whose remote branch is gone', async () => {
  const { repo, remote } = repoWithRemote()
  repo.git('branch', 'never-pushed')
  repo.git('branch', 'was-pushed')
  repo.git('push', '-q', '-u', 'origin', 'was-pushed')
  execFileSync('git', ['-C', remote, 'branch', '-D', 'was-pushed'])
  repo.git('fetch', '-q', '--prune')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const row = (name: string) =>
    sidebar(window).getByRole('button', { name: new RegExp(`^${name}`) })
  await expect(row('never-pushed').locator('[data-remote-state]')).toHaveText('local')
  await expect(row('was-pushed').locator('[data-remote-state]')).toHaveText('gone')
  await expect(row('main').locator('[data-remote-state]')).toHaveCount(0)
  await app.close()
})

test('cleans up a squash-merged branch and offers an abandoned one', async () => {
  const { repo, remote } = repoWithRemote()
  // A feature squash-merged into main (as "Squash and merge" on GitHub does).
  repo.git('switch', '-q', '-c', 'squashed')
  repo.write('s1.txt', 's1\n')
  repo.commit('s1')
  repo.write('s2.txt', 's2\n')
  repo.commit('s2')
  repo.git('push', '-q', '-u', 'origin', 'squashed')
  repo.git('switch', '-q', 'main')
  repo.git('merge', '-q', '--squash', 'squashed')
  repo.commit('Squashed feature (#1)')
  // A branch whose PR was closed without merging; its remote branch was deleted.
  repo.git('switch', '-q', '-c', 'abandoned')
  repo.write('a.txt', 'a\n')
  repo.commit('abandoned work')
  repo.git('push', '-q', '-u', 'origin', 'abandoned')
  repo.git('switch', '-q', 'main')
  for (const name of ['squashed', 'abandoned'])
    execFileSync('git', ['-C', remote, 'branch', '-D', name])
  repo.git('fetch', '-q', '--prune')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await sidebar(window).getByRole('button', { name: 'Clean up branches…' }).click()
  const dialog = window.getByTestId('prune-dialog')
  const squashed = dialog.locator('[data-group="squashed"]')
  await expect(squashed.getByRole('checkbox', { name: 'squashed' })).toBeChecked()
  const abandoned = dialog.locator('[data-group="remote-deleted"]')
  await expect(abandoned.getByRole('checkbox', { name: 'abandoned' })).not.toBeChecked()
  await expect(abandoned).toContainText('1 commit not on main')

  await dialog.getByRole('button', { name: 'Delete 1 branch' }).click()
  await expect(window.getByText('Deleted 1 branch')).toBeVisible()
  const branches = () => repo.git('branch', '--format=%(refname:short)').trim().split('\n').sort()
  expect(branches()).toEqual(['abandoned', 'main'])

  await window.keyboard.press('ControlOrMeta+z')
  await expect.poll(branches).toEqual(['abandoned', 'main', 'squashed'])
  await app.close()
})
