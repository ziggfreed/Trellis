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
      engines: { trellis: '>=0.3.0' },
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

test('a plugin made with create-trellis-plugin works straight away', async () => {
  // Run the real scaffolder, as `npm create trellis-plugin hello-sdk` would.
  const parent = tempDir()
  const cli = join(import.meta.dirname, '../../../packages/create-trellis-plugin/index.js')
  execFileSync(process.execPath, [cli, 'hello-sdk'], { cwd: parent })

  const { app, window } = await launch()
  await window.getByRole('heading', { name: 'Welcome to Trellis' }).click()
  await stubFolderPicker(app, join(parent, 'hello-sdk'))
  const panel = await openPluginSettings(window)
  await panel.getByRole('button', { name: 'Load development folder…' }).click()
  await expect(panel.getByRole('listitem', { name: 'Hello Sdk' })).toContainText('Running')
  await window.keyboard.press('Escape')

  await window.keyboard.press('ControlOrMeta+k')
  await window.getByPlaceholder('Type a command…').fill('say hello')
  await window.getByRole('option', { name: 'Say hello' }).click()
  await expect(window.getByText('Hello! Open a repository and try again.')).toBeVisible()
  await app.close()
})

test('plugins can add sidebar panels, commit badges, keep secrets and hear about operations', async () => {
  const folder = writePlugin(
    'api-demo',
    `
    const item = trellis.ui.createStatusBarItem()
    context.subscriptions.push(item)
    // Secrets round-trip through the encrypted store.
    trellis.secrets.set('token', 'abc').then(() => trellis.secrets.get('token')).then((value) => {
      item.text = 'secret:' + value
    })
    let clicks = 0
    const panel = trellis.ui.registerPanel('api-demo.panel', {
      getItems: (repo) => [
        { id: 'one', label: 'First item', description: 'clicked ' + clicks, icon: 'success', command: 'api-demo.run' },
      ],
    })
    context.subscriptions.push(
      panel,
      trellis.commands.register('api-demo.run', ({ item: id }) => {
        clicks++
        trellis.ui.showMessage('Clicked ' + id)
        panel.refresh()
      }),
      trellis.repos.onDidRunOperation(({ kind }) => { item.text = 'op:' + kind }),
      trellis.repos.onDidChangeActive(async (repo) => {
        if (!repo) return
        const head = await trellis.git.run(repo, ['rev-parse', 'HEAD'])
        trellis.graph.setDecorations(repo, [
          { sha: head.stdout.trim(), icon: 'success', tooltip: 'Demo badge', url: 'https://example.com/' },
        ])
      }),
    )`,
    {
      trellis: {
        contributes: {
          commands: [{ id: 'api-demo.run', title: 'Run demo', palette: false }],
          panels: [{ id: 'api-demo.panel', title: 'Demo panel' }],
        },
      },
    },
  )
  const userData = tempDir()
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ pluginDevFolders: [folder] }))
  const repo = createRepo()
  const { app, window } = await launch(userData)
  const status = window.getByTestId('plugin-status-item').filter({ hasText: /secret:|op:/ })
  await expect(status).toHaveText('secret:abc')
  await openRepo(app, window, repo.path)

  // The panel and its item.
  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await expect(sidebar.getByRole('button', { name: /Demo panel/ })).toBeVisible()
  const row = sidebar.getByRole('button', { name: /First item/ })
  await expect(row).toContainText('clicked 0')
  await row.click()
  await expect(window.getByText('Clicked one')).toBeVisible()
  await expect(row).toContainText('clicked 1') // the panel refreshed

  // The badge on the checked-out commit.
  await window.getByRole('tab', { name: /History/ }).click()
  await expect(window.getByTestId('commit-decoration')).toHaveAttribute('title', 'Demo badge')

  // Operations are reported for commands Trellis runs (not a terminal's),
  // so commit through the UI.
  await window.getByRole('tab', { name: /Changes/ }).click()
  repo.write('new.txt', 'new\n')
  // Wait for the watcher to list the file before staging it.
  await expect(window.getByText('new.txt')).toBeVisible()
  await window.getByRole('button', { name: 'Stage all' }).click()
  await window.getByLabel('Commit summary').fill('Add new file')
  const commit = window.getByRole('button', { name: /^Commit 1 file/ })
  await expect(commit).toBeEnabled()
  await commit.click()
  await expect(window.getByText(/^Committed/)).toBeVisible()
  await expect(status).toHaveText('op:commit')
  await app.close()
})
