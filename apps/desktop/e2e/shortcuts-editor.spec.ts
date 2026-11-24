/** Custom keyboard shortcuts, syntax highlighting in the hunk view, and the editor setting. */
import { basename } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, stubFolderPicker } from './helpers'

test.afterAll(cleanupTempDirs)

test('a shortcut can be changed in Settings and then used', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click() // focus the window
  await window.keyboard.press('ControlOrMeta+,')

  const shortcuts = window.getByRole('list', { name: 'Keyboard shortcuts' })
  const row = shortcuts.getByRole('listitem').filter({ hasText: /^Open repository/ })
  await row.getByRole('button', { name: 'Change' }).click()
  await window.getByLabel('New shortcut for Open repository').press('F2')
  await expect(row.locator('kbd')).toHaveText('F2')
  await window.keyboard.press('Escape') // close Settings

  await stubFolderPicker(app, repo.path)
  await window.keyboard.press('F2')
  await expect(window.getByRole('tab', { name: basename(repo.path) })).toBeVisible()
  await app.close()
})

test('the hunk view highlights code', async () => {
  const repo = createRepo()
  repo.write('app.ts', 'export const answer = 41\n')
  repo.commit('add app')
  repo.write('app.ts', 'export const answer = 42 // fixed\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByTestId('changes-list')
    .getByRole('button', { name: /app\.ts/ })
    .click()
  const view = window.getByTestId('patch-view')
  await expect(view.locator('.tok-keyword').first()).toHaveText('export')
  await expect(view.locator('.tok-comment')).toHaveText('// fixed')
  await app.close()
})

test('explains when the configured editor cannot be started', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.keyboard.press('ControlOrMeta+,')
  await window.getByLabel('Code editor').fill('no-such-editor-xyz')
  await window.keyboard.press('Escape')
  await window.getByRole('button', { name: 'Open in…' }).click()
  await window.getByRole('menuitem', { name: /Open in editor/ }).click()
  await expect(window.getByText('Couldn’t start the editor “no-such-editor-xyz”')).toBeVisible()
  await app.close()
})
