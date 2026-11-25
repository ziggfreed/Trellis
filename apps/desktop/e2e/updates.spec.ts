/** Settings > General > Updates. (A development build can't update itself.) */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, launch } from './helpers'
import packageJson from '../package.json' with { type: 'json' }

const { version } = packageJson

test.afterAll(cleanupTempDirs)

test('shows the version and explains that development builds don’t update', async () => {
  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click()
  await window.keyboard.press('ControlOrMeta+,')
  const dialog = window.getByRole('dialog')
  await expect(dialog).toContainText(`You have Trellis ${version}.`)
  await expect(dialog.getByLabel('Check for updates automatically')).toBeChecked()
  await dialog.getByRole('button', { name: 'Check now' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Development builds don’t update themselves.')
  await app.close()
})
