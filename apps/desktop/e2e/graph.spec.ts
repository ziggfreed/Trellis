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
