/** Reusing a recent commit message from the commit box. */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('fills the summary and description from a recent commit message', async () => {
  const repo = createRepo()
  repo.write('a.txt', '1\n')
  repo.git('add', '-A')
  repo.git('commit', '-m', 'PROJ-42: Add login page', '-m', 'Part of the login ticket.')
  repo.write('a.txt', '2\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  const summary = window.getByLabel('Commit summary')
  const description = window.getByLabel('Commit description')

  // Just the summary...
  await window.getByRole('button', { name: 'Recent messages' }).click()
  const list = window.getByTestId('recent-messages')
  const item = list.getByRole('listitem').filter({ hasText: 'PROJ-42: Add login page' })
  await item.hover()
  await item.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(summary).toHaveValue('PROJ-42: Add login page')
  await expect(description).toHaveValue('')

  // ...or the whole message.
  await summary.fill('')
  await window.getByRole('button', { name: 'Recent messages' }).click()
  await list.getByRole('button', { name: /PROJ-42: Add login page/ }).click()
  await expect(summary).toHaveValue('PROJ-42: Add login page')
  await expect(description).toHaveValue('Part of the login ticket.')
  await app.close()
})
