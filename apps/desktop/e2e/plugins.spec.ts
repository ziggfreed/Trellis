/** Plugins: the built-in plugins' commands, menus and prompts. */
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('a plugin command asks questions and fills in the commit message', async () => {
  const repo = createRepo()
  repo.write('README.md', '# changed\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.keyboard.press('ControlOrMeta+k')
  await window.getByPlaceholder('Type a command…').fill('conventional commit')
  await window.getByRole('option', { name: /Write a conventional commit message/ }).click()

  // Built-in Conventional Commits plugin: type, scope, description, breaking?
  await window.getByRole('option', { name: /^fix/ }).click()
  const dialog = window.getByRole('dialog')
  await dialog.getByRole('textbox').fill('docs-site')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await dialog.getByRole('textbox').fill('correct the readme')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await window.getByRole('option', { name: /^No/ }).click()

  await expect(window.getByLabel('Commit summary')).toHaveValue(
    'fix(docs-site): correct the readme',
  )
  await app.close()
})

test('a plugin adds a menu item that opens the commit on the remote website', async () => {
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', 'git@github.com:owner/project.git')
  const sha = repo.git('rev-parse', 'HEAD').trim()
  const { app, window } = await launch()
  // Record links instead of opening a browser.
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { opened?: string[] }).opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await openRepo(app, window, repo.path)

  await window.getByTestId('commit-row').first().click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Open commit on remote' }).click()
  await expect
    .poll(() => app.evaluate(() => (globalThis as { opened?: string[] }).opened))
    .toEqual([`https://github.com/owner/project/commit/${sha}`])
  await app.close()
})

test('a plugin status bar item flags unpushed commits that aren’t conventional', async () => {
  const remote = tempDir()
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', remote)
  repo.git('push', '-q', '-u', 'origin', 'main')
  repo.write('a.txt', 'a\n')
  repo.commit('feat: a proper message')
  repo.write('b.txt', 'b\n')
  repo.commit('quick fix')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const item = window.getByTestId('plugin-status-item')
  await expect(item).toHaveText('⚠ 1 non-conventional commit')
  await item.click()
  await expect(window.getByRole('option', { name: 'quick fix' })).toBeVisible()
  await app.close()
})
