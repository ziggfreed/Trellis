/**
 * Editing in the diff, rendered Markdown and JSON diffs, Git LFS, and
 * submodules.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

/** Select a file in the Changes view's Unstaged list. */
async function selectChange(window: Page, file: string) {
  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByRole('region', { name: 'Unstaged', exact: true })
    .getByRole('button', { name: new RegExp(file.replace('.', '\\.')) })
    .first()
    .click()
}

test('edits a changed file right in the diff and saves it', async () => {
  const repo = createRepo()
  repo.write('notes.txt', 'one\ntwo\n')
  repo.commit('add notes')
  repo.write('notes.txt', 'one\ntwo\nthree\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await selectChange(window, 'notes.txt')

  await window.getByRole('radio', { name: 'Edit' }).click()
  const editor = window.getByRole('textbox', { name: 'Edit notes.txt' })
  await expect(editor).toBeVisible()
  await editor.press('ControlOrMeta+End')
  await editor.pressSequentially('four\n')
  await expect(window.getByText('Unsaved changes')).toBeVisible()
  await editor.press('ControlOrMeta+s')
  await expect(window.getByText('Saved notes.txt')).toBeVisible()
  expect(readFileSync(join(repo.path, 'notes.txt'), 'utf8')).toBe('one\ntwo\nthree\nfour\n')
  await app.close()
})

test('shows Markdown rendered with changed blocks, and JSON changes by path', async () => {
  const repo = createRepo()
  repo.write('README.md', '# Title\n\nOld paragraph.\n\n- keep\n')
  repo.write('package.json', JSON.stringify({ name: 'app', version: '1.0.0' }, null, 2))
  repo.commit('docs and package')
  repo.write('README.md', '# Title\n\nNew **bold** paragraph.\n\n- keep\n- added item\n')
  // Same data with different formatting and key order, plus one real change.
  repo.write('package.json', '{"version":"1.1.0","name":"app"}\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await selectChange(window, 'README.md')
  await window.getByRole('radio', { name: 'Rendered' }).click()
  const markdown = window.getByTestId('markdown-diff')
  await expect(markdown.locator('[data-change="removed"]')).toHaveText('Old paragraph.')
  await expect(markdown.locator('[data-change="added"]').first()).toHaveText('New bold paragraph.')
  await expect(markdown.locator('[data-change="added"] strong')).toHaveText('bold')
  await expect(markdown.locator('[data-change="added"]').nth(1)).toHaveText('added item')

  await selectChange(window, 'package.json')
  await window.getByRole('radio', { name: 'Data' }).click()
  const json = window.getByTestId('json-diff')
  await expect(json).toContainText('1 change')
  await expect(json).toContainText('version')
  await expect(json).toContainText('"1.0.0"')
  await expect(json).toContainText('"1.1.0"')
  await app.close()
})

test('describes Git LFS pointer changes instead of showing pointer text', async () => {
  const repo = createRepo()
  const pointer = (size: number) =>
    `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize ${size}\n`
  repo.write('art.psd', pointer(1024))
  repo.commit('add art')
  repo.write('art.psd', pointer(2048))
  repo.commit('update art')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByTestId('commit-row').filter({ hasText: 'update art' }).click()
  await window.getByRole('button', { name: /art\.psd/ }).click()
  await expect(window.getByText('Large file stored with Git LFS')).toBeVisible()
  await expect(window.getByText(/Changed from 1(\.0)? KB to 2(\.0)? KB/)).toBeVisible()
  await app.close()
})

/** Whether git-lfs is installed on this machine. */
function hasGitLfs() {
  try {
    execFileSync('git', ['lfs', 'version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('lists LFS patterns and stores a file type with LFS from its menu', async () => {
  test.skip(!hasGitLfs(), 'needs git-lfs')
  const repo = createRepo()
  repo.write('.gitattributes', '*.psd filter=lfs diff=lfs merge=lfs -text\n')
  repo.commit('use lfs')
  repo.write('data.bin', 'x\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: /Git LFS/ }).click()
  await expect(sidebar.getByRole('button', { name: '*.psd' })).toBeVisible()

  await window.getByRole('tab', { name: /Changes/ }).click()
  await window
    .getByRole('button', { name: /data\.bin/ })
    .first()
    .click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Git LFS' }).click()
  await window.getByRole('menuitem', { name: 'Store all *.bin files with LFS' }).click()
  await expect(sidebar.getByRole('button', { name: '*.bin' })).toBeVisible()
  expect(readFileSync(join(repo.path, '.gitattributes'), 'utf8')).toContain('*.bin filter=lfs')
  await app.close()
})

test('lists submodules, sets one up, and opens it in a tab', async () => {
  // Local folders as submodule URLs need this since git 2.38 (a security default).
  const allowFile = ['-c', 'protocol.file.allow=always']
  const library = createRepo()
  const project = createRepo()
  project.git(...allowFile, 'submodule', 'add', library.path, 'lib')
  project.commit('add lib')
  project.git('submodule', 'deinit', '-q', '-f', 'lib') // as if freshly cloned
  const { app, window } = await launch(undefined, {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'protocol.file.allow',
    GIT_CONFIG_VALUE_0: 'always',
  })
  await openRepo(app, window, project.path)

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  const lib = sidebar.getByRole('button', { name: 'lib', exact: true })
  await expect(lib).toHaveAttribute('title', /Not set up yet/)
  await lib.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Set up (update)' }).click()
  await expect(lib).toHaveAttribute('title', /Up to date/)
  expect(readFileSync(join(project.path, 'lib', 'README.md'), 'utf8')).toBe('# test\n')

  await lib.click()
  await expect(window.getByRole('tab', { name: 'lib' })).toHaveAttribute('aria-selected', 'true')
  await app.close()
})
