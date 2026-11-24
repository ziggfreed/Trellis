/**
 * Smoke tests for the desktop app. Each test uses a fresh settings folder and
 * a throwaway git repository, so it never touches your real Trellis settings.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const appEntry = join(import.meta.dirname, '../out/main/index.js')
const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trellis-e2e-'))
  tempDirs.push(dir)
  return dir
}

function createRepo(): string {
  const dir = tempDir()
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir })
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Trellis Test')
  git('config', 'user.email', 'test@example.com')
  writeFileSync(join(dir, 'README.md'), '# test\n')
  git('add', '.')
  git('commit', '-m', 'initial commit')
  return dir
}

async function launch(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    // --no-sandbox is needed to run Chromium as root inside CI containers.
    args: [appEntry, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, TRELLIS_USER_DATA_DIR: userDataDir },
  })
}

/** Make the native "choose folder" dialog return `folder` without showing it. */
async function stubFolderPicker(app: ElectronApplication, folder: string) {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, folder)
}

test.afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

test('shows the welcome screen on first launch', async () => {
  const app = await launch(tempDir())
  const window = await app.firstWindow()
  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await app.close()
})

test('opens a repository in a tab and restores it after restart', async () => {
  const userData = tempDir()
  const repo = createRepo()

  let app = await launch(userData)
  let window = await app.firstWindow()
  await stubFolderPicker(app, repo)
  await window.getByRole('button', { name: 'Open repository' }).first().click()

  await expect(window.getByRole('tab', { name: basename(repo) })).toBeVisible()
  await expect(window.getByTestId('repo-title')).toHaveText(basename(repo))
  await expect(window.getByTestId('status-branch')).toHaveText('main')
  await app.close()

  // Relaunch: the tab should come back.
  app = await launch(userData)
  window = await app.firstWindow()
  await expect(window.getByTestId('repo-title')).toHaveText(basename(repo))
  await app.close()
})

test('closing the last tab returns to the home screen with the repo in Recent', async () => {
  const repo = createRepo()
  const app = await launch(tempDir())
  const window = await app.firstWindow()
  await stubFolderPicker(app, repo)
  await window.getByRole('button', { name: 'Open repository' }).first().click()
  await window.getByRole('button', { name: `Close ${basename(repo)}` }).click()

  await expect(window.getByRole('heading', { name: 'Welcome to Trellis' })).toBeVisible()
  await expect(window.getByTestId('recent-repos')).toContainText(basename(repo))
  await app.close()
})

test('shows an error for a folder that is not a git repository', async () => {
  const app = await launch(tempDir())
  const window = await app.firstWindow()
  await stubFolderPicker(app, tempDir())
  await window.getByRole('button', { name: 'Open repository' }).first().click()
  await expect(window.getByText('is not a git repository')).toBeVisible()
  await app.close()
})
