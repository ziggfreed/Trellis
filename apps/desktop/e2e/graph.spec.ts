/**
 * Phase 2 flows: the commit graph, the branch filter, and commit search
 * (including jumping to a result that isn't loaded yet).
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

/** main: initial -> base -> merge(feature) ; feature: base -> feature work ; side: unmerged */
function repoWithBranches() {
  const repo = createRepo()
  repo.write('a.txt', '1\n')
  repo.commit('base commit')
  repo.git('switch', '-c', 'feature')
  repo.write('feature.txt', 'f\n')
  repo.commit('feature work')
  repo.git('switch', 'main')
  repo.write('main.txt', 'm\n')
  repo.commit('main work')
  repo.git('merge', '--no-ff', '-m', 'merge feature', 'feature')
  repo.git('switch', '-c', 'side', 'HEAD~1')
  repo.write('side.txt', 's\n')
  repo.commit('side work')
  repo.git('switch', 'main')
  return repo
}

test('draws the commit graph with a dot for every commit', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const rows = window.getByTestId('commit-row')
  await expect(rows).toHaveCount(6)
  // Every row has a graph with a dot; branches need more than one lane.
  for (const row of await rows.all()) await expect(row.locator('svg circle').first()).toBeVisible()
  const widths = await rows
    .locator('svg')
    .evaluateAll((svgs) => svgs.map((svg) => Number(svg.getAttribute('width'))))
  expect(Math.max(...widths)).toBeGreaterThan(14) // at least two lanes
  await app.close()
})

test('the branch filter shows only the current branch', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await expect(window.getByText('side work')).toBeVisible()

  await window.getByRole('button', { name: 'Branches shown' }).click()
  await window.getByRole('menuitemradio', { name: 'Current branch' }).click()
  await expect(window.getByText('side work')).toBeHidden()
  await expect(window.getByTestId('commit-row')).toHaveCount(5)
  await app.close()
})

test('searches commits and jumps between results', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const search = window.getByLabel('Search commits')
  await search.fill('WORK') // case-insensitive
  await expect(window.getByTestId('search-count')).toHaveText('3 found')
  await expect(window.locator('[data-match]')).toHaveCount(3)

  await search.press('Enter')
  await expect(window.getByTestId('search-count')).toHaveText('1 of 3')
  await search.press('Enter')
  await expect(window.getByTestId('search-count')).toHaveText('2 of 3')
  await search.press('Shift+Enter')
  await expect(window.getByTestId('search-count')).toHaveText('1 of 3')

  await search.press('Escape')
  await expect(window.getByTestId('search-count')).toBeHidden()
  await app.close()
})

test('jumping to a search result loads older history as needed', async () => {
  const repoPath = join(tempDir(), 'long')
  const script = join(import.meta.dirname, '../../../scripts/create-benchmark-repo.mjs')
  execFileSync(process.execPath, [script, repoPath, '3000'])

  const { app, window } = await launch()
  await openRepo(app, window, repoPath)
  const search = window.getByLabel('Search commits')
  await search.fill('Commit 1 on main') // the very first commit, far past the first page
  await expect(window.getByTestId('search-count')).toHaveText('1 found')
  await search.press('Enter')
  await expect(window.getByTestId('commit-details')).toContainText('Commit 1 on main')
  await expect(window.getByRole('option', { selected: true })).toContainText('Commit 1 on main')
  await app.close()
})

test('keeps the checked-out branch in the leftmost lane', async () => {
  // "side work" is the newest commit, but main is checked out.
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const dotX = async (subject: string) =>
    Number(
      await window
        .getByTestId('commit-row')
        .filter({ hasText: subject })
        .locator('svg circle')
        .first()
        .getAttribute('cx'),
    )
  const mainX = await dotX('merge feature')
  expect(await dotX('side work')).toBeGreaterThan(mainX)
  expect(await dotX('main work')).toBe(mainX)
  await app.close()
})

test('orders the graph by branch (default) or by date, remembered', async () => {
  // main and dev both get commits over the same period, alternating.
  const repo = createRepo()
  const at = (hour: number) => new Date(Date.UTC(2026, 0, 1, hour)).toISOString()
  const commitAt = (message: string, hour: number) => {
    repo.write(`${message}.txt`, message)
    repo.git('add', '-A')
    execFileSync('git', ['commit', '-qm', message], {
      cwd: repo.path,
      env: { ...process.env, GIT_AUTHOR_DATE: at(hour), GIT_COMMITTER_DATE: at(hour) },
    })
  }
  repo.git('branch', 'dev')
  commitAt('main 1', 2)
  repo.git('switch', '-q', 'dev')
  commitAt('dev 1', 1)
  commitAt('dev 2', 3)
  repo.git('switch', '-q', 'main')
  commitAt('main 2', 4)

  const userData = tempDir()
  let { app, window } = await launch(userData)
  await openRepo(app, window, repo.path)
  const subjects = () =>
    window
      .getByTestId('commit-row')
      .evaluateAll((rows) => rows.slice(0, 4).map((r) => r.textContent ?? ''))
  const branchOf = (texts: string[]) => texts.map((t) => (t.includes('dev ') ? 'dev' : 'main'))

  // By default each branch's commits are together: main, main, dev, dev (or dev first).
  await expect(window.getByTestId('commit-row')).toHaveCount(5)
  const together = branchOf(await subjects())
  expect(together.filter((b, i) => b !== together[i - 1])).toHaveLength(2)

  await window.getByRole('button', { name: 'Branches shown' }).click()
  await window.getByRole('menuitemradio', { name: 'By date' }).click()
  await expect.poll(async () => branchOf(await subjects())).toEqual(['main', 'dev', 'main', 'dev'])
  await expect(window.getByRole('button', { name: 'Branches shown' })).toContainText('by date')
  await app.close()

  // Still by date after a restart (the repository's tab reopens by itself).
  ;({ app, window } = await launch(userData))
  await expect.poll(async () => branchOf(await subjects())).toEqual(['main', 'dev', 'main', 'dev'])
  await app.close()
})

test('clicking a branch label keeps its commits highlighted until cleared', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const rows = window.getByTestId('commit-row')
  const bar = window.getByTestId('pinned-highlight')

  await rows.locator('[data-ref="refs/heads/side"]').click()
  await expect(bar).toContainText('Highlighting side')
  // Moving the pointer away (e.g. to scroll) keeps the highlight.
  await window.mouse.move(0, 0)
  await expect(rows.filter({ hasText: 'merge feature' })).toHaveAttribute('data-dimmed', 'true')
  await expect(rows.filter({ hasText: 'side work' })).not.toHaveAttribute('data-dimmed')

  // Esc in the list clears it; so does clicking the label again.
  await window.getByRole('listbox', { name: 'Commits' }).press('Escape')
  await expect(bar).toBeHidden()
  await expect(rows.filter({ hasText: 'merge feature' })).not.toHaveAttribute('data-dimmed')

  // From the commit's right-click menu, and from the sidebar.
  await rows.filter({ hasText: 'side work' }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Highlight side' }).click()
  await expect(bar).toContainText('Highlighting side')
  await bar.getByRole('button', { name: 'Stop highlighting' }).click()
  await expect(bar).toBeHidden()

  await window.getByRole('radio', { name: 'Timeline' }).click()
  await window
    .getByRole('navigation', { name: 'Repository' })
    .getByText('feature', { exact: true })
    .click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Highlight in history' }).click()
  // Switches back to the graph to show it.
  await expect(bar).toContainText('Highlighting feature')
  await expect(rows.filter({ hasText: 'feature work' })).not.toHaveAttribute('data-dimmed')
  await expect(rows.filter({ hasText: 'side work' })).toHaveAttribute('data-dimmed', 'true')
  await app.close()
})

test('hovering a branch label highlights its commits', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const rows = window.getByTestId('commit-row')
  // The list can re-render just after the repository opens (refs and the
  // graph column load separately), which can swallow the first mouseenter.
  // Hover again until the highlight shows, so the test isn't flaky.
  await expect(async () => {
    await window.mouse.move(0, 0)
    await rows.locator('[data-ref="refs/heads/side"]').hover()
    await expect(rows.filter({ hasText: 'merge feature' })).toHaveAttribute('data-dimmed', 'true', {
      timeout: 1000,
    })
  }).toPass()
  // side's line: side work → main work → base commit → initial commit.
  await expect(rows.filter({ hasText: 'side work' })).not.toHaveAttribute('data-dimmed')
  await expect(rows.filter({ hasText: 'base commit' })).not.toHaveAttribute('data-dimmed')
  await expect(rows.filter({ hasText: 'merge feature' })).toHaveAttribute('data-dimmed', 'true')
  await expect(rows.filter({ hasText: 'feature work' })).toHaveAttribute('data-dimmed', 'true')

  await window.mouse.move(0, 0)
  await expect(rows.filter({ hasText: 'feature work' })).not.toHaveAttribute('data-dimmed')
  await app.close()
})
