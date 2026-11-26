/**
 * In-app help (the user guide link in the status bar and the command
 * palette's Help commands) and the tips card on the home screen, including
 * hiding it and turning it back on.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { cleanupTempDirs, launch, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

/** Record links the app opens in the browser instead of opening them. */
async function captureLinks(app: ElectronApplication) {
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { openedLinks?: string[] }).openedLinks = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  return () => app.evaluate(() => (globalThis as { openedLinks?: string[] }).openedLinks ?? [])
}

const tipsCard = (window: Page) => window.getByTestId('tips-card')

test('opens the user guide from the status bar and the command palette', async () => {
  const { app, window } = await launch()
  const opened = await captureLinks(app)

  await window.getByRole('button', { name: 'User guide' }).click()
  await expect.poll(opened).toEqual(['https://github.com/ziggfreed/Trellis/wiki'])

  await window.keyboard.press('Control+K')
  const palette = window.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('combobox').fill('choose a page')
  await window.keyboard.press('Enter')
  await palette.getByRole('option', { name: 'Writing plugins' }).click()
  await expect.poll(opened).toContain('https://github.com/ziggfreed/Trellis/wiki/Writing-Plugins')
  await app.close()
})

test('flips through tips, and hiding them is remembered', async () => {
  const userData = tempDir()
  const { app, window } = await launch(userData)
  const opened = await captureLinks(app)

  const card = tipsCard(window)
  await expect(card).toBeVisible()
  const position = card.getByTestId('tip-position')
  const first = await position.textContent()
  const firstTitle = await card.getByRole('heading').textContent()
  await card.getByRole('button', { name: 'Next tip' }).click()
  await expect(card.getByRole('heading')).not.toHaveText(firstTitle!)
  await card.getByRole('button', { name: 'Previous tip' }).click()
  await expect(position).toHaveText(first!)

  // "Learn more" opens the tip's page of the user guide (every tip has one).
  await card.getByRole('button', { name: 'Learn more' }).click()
  await expect.poll(async () => (await opened())[0]).toMatch(/\/wiki\/[A-Z]/)

  await card.getByRole('button', { name: 'Hide tips' }).click()
  await expect(card).toBeHidden()
  await expect(window.getByText('Tips hidden')).toBeVisible()
  await app.close()

  // Still hidden after a restart; turn them back on in Settings.
  const again = await launch(userData)
  await expect(again.window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await expect(tipsCard(again.window)).toBeHidden()
  await again.window.keyboard.press('Control+,')
  const checkbox = again.window.getByRole('checkbox', { name: 'Show tips on the home screen' })
  await expect(checkbox).not.toBeChecked()
  await checkbox.check()
  await again.window.keyboard.press('Escape')
  await expect(tipsCard(again.window)).toBeVisible()
  await again.app.close()
})

test('the command palette hides and shows tips', async () => {
  const { app, window } = await launch()
  await expect(tipsCard(window)).toBeVisible()
  const palette = window.getByRole('dialog', { name: 'Command palette' })

  await window.keyboard.press('Control+K')
  await palette.getByRole('combobox').fill('hide tips')
  await window.keyboard.press('Enter')
  await expect(tipsCard(window)).toBeHidden()

  await window.keyboard.press('Control+K')
  await palette.getByRole('combobox').fill('show tips')
  await window.keyboard.press('Enter')
  await expect(tipsCard(window)).toBeVisible()
  await app.close()
})
