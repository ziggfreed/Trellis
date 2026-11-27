/**
 * Slow operations say what's happening: a write that's still running after
 * a moment shows a "…" notice until it ends (main/services/repo-queue.ts
 * and features/repos/use-busy-notices.ts). Quick ones show nothing.
 */
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('a slow commit (a pre-commit hook) shows a notice until it finishes', async () => {
  const repo = createRepo()
  // A hook that takes a couple of seconds, like a linter or test run.
  const hook = join(repo.path, '.git', 'hooks', 'pre-commit')
  writeFileSync(hook, '#!/bin/sh\nsleep 2\n')
  chmodSync(hook, 0o755)
  repo.write('a.txt', 'a\n')
  repo.git('add', 'a.txt')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window.getByLabel('Commit summary').fill('slow one')
  await window.getByRole('button', { name: /^Commit/ }).click()

  const notice = window.locator('[data-sonner-toast][data-type="loading"]')
  await expect(notice).toContainText('Commit “slow one”…')
  await expect(window.getByText('Your working tree is clean')).toBeVisible({ timeout: 10_000 })
  await expect(notice).toHaveCount(0)
  await app.close()
})

test('quick operations show no notice', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByRole('region', { name: 'Unstaged', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'README.md' })
    .getByRole('button', { name: 'Stage', exact: true })
    .click()
  await expect(window.getByRole('region', { name: 'Staged', exact: true })).toContainText(
    'README.md',
  )
  await window.waitForTimeout(600)
  await expect(window.locator('[data-sonner-toast][data-type="loading"]')).toHaveCount(0)
  await app.close()
})
