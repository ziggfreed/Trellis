/**
 * Long error messages (e.g. a failing git hook's output) must fit on the
 * screen, scroll, and stay closable.
 */
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

test('a very long error toast fits on screen and can be closed', async () => {
  const repo = createRepo()
  // A pre-commit hook that prints far more than fits on screen, then fails.
  const hook = join(repo.path, '.git', 'hooks', 'pre-commit')
  writeFileSync(
    hook,
    '#!/bin/sh\nfor i in $(seq 1 40); do printf "lint error %s: %0300d\\n" "$i" 0 >&2; done\nexit 1\n',
  )
  chmodSync(hook, 0o755)
  repo.write('a.txt', 'a\n')
  repo.git('add', 'a.txt')

  const { app, window } = await launch()
  await window.setViewportSize({ width: 1000, height: 600 })
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window.getByLabel('Commit summary').fill('will fail')
  await window.getByRole('button', { name: /^Commit/ }).click()

  const toast = window.locator('[data-sonner-toast][data-type="error"]')
  await expect(toast).toContainText('lint error 40') // the end of the output is kept
  const box = (await toast.boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.height).toBeLessThan(600)
  await toast.getByRole('button', { name: /close/i }).click()
  await expect(toast).toHaveCount(0)
  await app.close()
})
