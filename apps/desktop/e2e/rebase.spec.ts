/** The interactive rebase editor: reorder, fixup, reword, and undo it all. */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('reorders, fixes up and rewords commits, then undoes the rebase', async () => {
  const repo = createRepo()
  for (const name of ['A', 'B', 'C']) {
    repo.write(`${name}.txt`, `${name}\n`)
    repo.commit(`commit ${name}`)
  }
  const before = repo.git('rev-parse', 'HEAD').trim()

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByTestId('commit-row').filter({ hasText: 'commit A' }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Interactive rebase from here…' }).click()

  const list = window.getByTestId('rebase-list')
  await expect(list.getByRole('listitem')).toHaveCount(3)
  // Move C to the top, make B a fixup of A, and reword A.
  await window.getByRole('button', { name: 'Move commit C up' }).click()
  await window.getByRole('button', { name: 'Move commit C up' }).click()
  await window.getByLabel('Action for commit B').selectOption('fixup')
  await window.getByLabel('Action for commit A').selectOption('reword')
  await window.getByLabel('New message for commit A').fill('A and B together')
  await expect(window.getByText('3 commits become 2.')).toBeVisible()
  await window.getByRole('button', { name: 'Start rebase' }).click()

  await expect(window.getByText('Rebase complete')).toBeVisible()
  expect(repo.git('log', '--format=%s').trim().split('\n')).toEqual([
    'A and B together',
    'commit C',
    'initial commit',
  ])

  await window.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(window.getByText('Undone: Interactive rebase')).toBeVisible()
  expect(repo.git('rev-parse', 'HEAD').trim()).toBe(before)
  await app.close()
})
