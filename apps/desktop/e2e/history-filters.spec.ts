/** Filtering history by author, file and code changes. */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('filters history by author, file and code changes', async () => {
  const repo = createRepo()
  repo.write('src/app.ts', 'const answer = 41\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'Start app', '--author=Ann <ann@example.com>')
  repo.write('docs/guide.md', '# Guide\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'Write guide', '--author=Bob <bob@example.com>')
  repo.write('src/app.ts', 'const answer = 42\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'Fix answer', '--author=Ann <ann@example.com>')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const count = window.getByTestId('search-count')

  await window.getByRole('button', { name: 'Filter' }).click()
  const popover = window.getByRole('dialog', { name: 'Filter commits' })
  await popover.getByLabel('Author').fill('ann')
  await expect(count).toHaveText('2 found')
  await expect(window.getByRole('button', { name: 'Filter (1 active)' })).toBeVisible()

  await popover.getByLabel('Author').fill('')
  await popover.getByLabel('File or folder').fill('docs')
  await expect(count).toHaveText('1 found')
  await expect(window.locator('[data-match]')).toHaveText(/Write guide/)

  await popover.getByLabel('File or folder').fill('')
  await popover.getByLabel('Code added or removed').fill('answer = 41')
  await expect(count).toHaveText('2 found')

  await popover.getByRole('button', { name: 'Clear filters' }).click()
  await expect(count).toBeHidden()
  await app.close()
})
