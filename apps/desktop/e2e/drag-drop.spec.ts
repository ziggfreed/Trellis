/** Dragging branches onto other branches and commits. */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

function repoWithBranches() {
  const repo = createRepo()
  repo.git('switch', '-c', 'feature')
  repo.write('feature.txt', 'f\n')
  repo.commit('feature work')
  repo.git('switch', '-c', 'spare', 'main')
  repo.git('switch', 'main')
  repo.write('main.txt', 'm\n')
  repo.commit('main work')
  return repo
}

test('merges a branch by dragging its label onto the current branch', async () => {
  const repo = repoWithBranches()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const featureLabel = window.locator('[data-ref="refs/heads/feature"]')
  const mainLabel = window.locator('[data-ref="refs/heads/main"]')
  await featureLabel.dragTo(mainLabel)
  await window.getByRole('menuitem', { name: 'Merge feature into main' }).click()
  await expect(window.getByText('Merge feature into main')).toBeVisible()
  expect(repo.git('log', '-1', '--format=%P').trim().split(' ')).toHaveLength(2)
  await app.close()
})

test('moves a branch by dragging it from the sidebar onto a commit', async () => {
  const repo = repoWithBranches()
  const tip = repo.git('rev-parse', 'feature').trim()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  const target = window.getByTestId('commit-row').filter({ hasText: 'feature work' })
  await sidebar.getByRole('button', { name: 'spare' }).dragTo(target)
  await window.getByRole('menuitem', { name: /^Move spare to/ }).click()
  await expect.poll(() => repo.git('rev-parse', 'spare').trim()).toBe(tip)
  await app.close()
})
