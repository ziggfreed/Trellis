/**
 * Shared helpers for end-to-end tests: launching the app with a throwaway
 * settings folder, creating temporary git repositories, and faking the
 * native folder picker (which Playwright can't click).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const appEntry = join(import.meta.dirname, '../out/main/index.js')
const tempDirs: string[] = []

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'trellis-e2e-'))
  tempDirs.push(dir)
  return dir
}

/**
 * Delete every temporary folder created by `tempDir`. Call from `test.afterAll`.
 * On Windows, Electron can keep files in its data folder locked for a moment
 * after closing, so retry, and leave anything still locked for the OS to clean up.
 */
export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // Still locked; it's in the temp folder, so it will be cleaned up eventually.
    }
  }
}

export interface TestRepo {
  path: string
  git: (...args: string[]) => string
  write: (file: string, content: string) => void
  commit: (message: string) => void
}

/** Create a repository with one commit ("initial commit" adding README.md). */
export function createRepo(): TestRepo {
  const path = tempDir()
  const git = (...args: string[]) => execFileSync('git', args, { cwd: path, encoding: 'utf8' })
  const write = (file: string, content: string) => {
    mkdirSync(dirname(join(path, file)), { recursive: true })
    writeFileSync(join(path, file), content)
  }
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Trellis Test')
  git('config', 'user.email', 'test@example.com')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.autocrlf', 'false') // same line endings on every OS
  const commit = (message: string) => {
    git('add', '-A')
    git('commit', '-m', message)
  }
  write('README.md', '# test\n')
  commit('initial commit')
  return { path, git, write, commit }
}

export async function launch(
  userDataDir = tempDir(),
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    // --no-sandbox is needed to run Chromium as root inside CI containers.
    args: [appEntry, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, TRELLIS_USER_DATA_DIR: userDataDir, ...env },
  })
  return { app, window: await app.firstWindow() }
}

/** Make the native "choose folder" dialog return `folder` without showing it. */
export async function stubFolderPicker(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, folder)
}

/**
 * Open `repoPath` in a new tab via the home screen's "Open repository"
 * button, and wait until that tab is the active one (so the next step can't
 * race the tab opening on slow machines).
 */
export async function openRepo(app: ElectronApplication, window: Page, repoPath: string) {
  await stubFolderPicker(app, repoPath)
  await window.getByRole('button', { name: 'Open repository' }).first().click()
  await expect(window.getByRole('tab', { name: basename(repoPath) })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}
