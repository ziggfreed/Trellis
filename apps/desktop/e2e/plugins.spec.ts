/** Plugins: the built-in plugins' commands, menus and prompts. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, stubFolderPicker, tempDir } from './helpers'

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

/** Write a small plugin into a new folder. `code` is the body of activate(). */
function writePlugin(name: string, code: string, extra: Record<string, unknown> = {}) {
  const folder = join(tempDir(), name)
  mkdirSync(folder)
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: 'index.js',
      engines: { trellis: '>=0.2.0' },
      trellis: {
        contributes: {
          commands: [{ id: `${name}.run`, title: `Run ${name}` }],
          settings: [{ key: 'greeting', type: 'string', default: 'Hello', title: 'Greeting' }],
        },
      },
      ...extra,
    }),
  )
  writeFileSync(
    join(folder, 'index.js'),
    `export function activate(trellis, context) {\n${code}\n}\n`,
  )
  return folder
}

async function openPluginSettings(window: Page) {
  await window.keyboard.press('ControlOrMeta+,')
  await window.getByRole('tab', { name: 'Plugins' }).click()
  return window.getByTestId('plugins-panel')
}

test('a development plugin loads, follows its settings, and reloads after code changes', async () => {
  const code = (prefix: string) => `
    const item = trellis.ui.createStatusBarItem()
    const show = () => { item.text = '${prefix}' + trellis.settings.get('greeting') }
    show()
    context.subscriptions.push(item, trellis.settings.onDidChange(show))`
  const folder = writePlugin('hello-dev', code(''))
  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click() // focus the window
  await stubFolderPicker(app, folder)
  const panel = await openPluginSettings(window)
  await panel.getByRole('button', { name: 'Load development folder…' }).click()

  const row = panel.getByRole('listitem', { name: 'hello-dev' })
  await expect(row).toContainText('Running')
  await expect(row).toContainText('Development')
  const status = window.getByTestId('plugin-status-item')
  await expect(status).toHaveText('Hello')

  await row.getByRole('button', { name: 'Settings' }).click()
  await row.getByLabel('Greeting').fill('Hi')
  await expect(status).toHaveText('Hi')

  writeFileSync(
    join(folder, 'index.js'),
    `export function activate(trellis, context) {\n${code('v2 ')}\n}\n`,
  )
  await panel.getByRole('button', { name: 'Reload plugins' }).click()
  await expect(status).toHaveText('v2 Hi')
  await app.close()
})

test('a failing plugin shows its error, and built-in plugins can be turned off', async () => {
  const folder = writePlugin('broken-dev', `throw new Error('Something went wrong in activate')`)
  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click()
  await stubFolderPicker(app, folder)
  const panel = await openPluginSettings(window)
  await panel.getByRole('button', { name: 'Load development folder…' }).click()
  await expect(panel.getByRole('listitem', { name: 'broken-dev' })).toContainText(
    'Something went wrong in activate',
  )

  const builtIn = panel.getByRole('listitem', { name: 'Conventional Commits' })
  await expect(builtIn).toContainText('Running')
  await builtIn.getByRole('checkbox', { name: 'On' }).uncheck()
  await expect(builtIn).toContainText('Off')
  await window.keyboard.press('Escape')

  await window.keyboard.press('ControlOrMeta+k')
  await window.getByPlaceholder('Type a command…').fill('conventional commit')
  await expect(
    window.getByRole('option', { name: /Write a conventional commit message/ }),
  ).toHaveCount(0)
  await app.close()
})

test('installs a plugin from a folder and uninstalls it', async () => {
  const folder = writePlugin('installable', '', { trellis: { displayName: 'Installable' } })
  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click()
  await stubFolderPicker(app, folder)
  const panel = await openPluginSettings(window)
  await panel.getByRole('button', { name: 'Install from folder…' }).click()
  // Confirm the "plugins can run any code" warning.
  await window.getByRole('button', { name: 'Install', exact: true }).click()

  const row = panel.getByRole('listitem', { name: 'Installable' })
  await expect(row).toContainText('Installed')
  await expect(row).toContainText('Running')
  await row.getByRole('button', { name: 'Uninstall' }).click()
  await window
    .getByRole('dialog')
    .getByRole('button', { name: 'Uninstall', exact: true })
    .last()
    .click()
  await expect(row).toHaveCount(0)
  await app.close()
})
