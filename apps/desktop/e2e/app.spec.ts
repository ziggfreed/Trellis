/**
 * Smoke tests for the app shell: welcome screen, tabs and settings that
 * survive a restart.
 */
import { basename } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, stubFolderPicker, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('shows the welcome screen on first launch', async () => {
  const { app, window } = await launch()
  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await app.close()
})

test('opens a repository in a tab and restores it after restart', async () => {
  const userData = tempDir()
  const repo = createRepo()

  let { app, window } = await launch(userData)
  const started = Date.now()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: basename(repo.path) }).waitFor({ timeout: 30_000 })
  // Diagnostics: print how long opening took and every git command run so far.
  console.log(`Opened repo tab after ${Date.now() - started} ms`)
  type Entry = { time: number; durationMs: number; args: string[] }
  const commands = await window.evaluate(() =>
    (
      globalThis as unknown as { trellis: { invoke: (c: string) => Promise<Entry[]> } }
    ).trellis.invoke('git:getCommandLog'),
  )
  for (const c of commands)
    console.log(`  ${c.time - started} ms  ${c.durationMs} ms  git ${c.args.join(' ')}`)
  await expect(window.getByRole('tab', { name: basename(repo.path) })).toBeVisible()
  await expect(window.getByTestId('status-branch')).toHaveText('main')
  await app.close()

  // Relaunch: the tab should come back.
  ;({ app, window } = await launch(userData))
  await expect(window.getByRole('tab', { name: basename(repo.path) })).toBeVisible()
  await expect(window.getByText('initial commit')).toBeVisible()
  await app.close()
})

test('closing the last tab returns to the home screen with the repo in Recent', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('button', { name: `Close ${basename(repo.path)}` }).click()

  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await expect(window.getByTestId('recent-repos')).toContainText(basename(repo.path))
  await app.close()
})

test('shows an error for a folder that is not a git repository', async () => {
  const { app, window } = await launch()
  await stubFolderPicker(app, tempDir())
  await window.getByRole('button', { name: 'Open repository' }).first().click()
  await expect(window.getByText('is not a git repository')).toBeVisible()
  await app.close()
})
