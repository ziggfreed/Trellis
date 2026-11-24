/**
 * Phase 1 flows: browsing history, commit details and diffs, the changes
 * view with live refresh, and cloning / creating repositories.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, stubFolderPicker, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('shows history, commit details and a diff', async () => {
  const repo = createRepo()
  repo.write('src/greet.ts', 'export const greet = () => "hello"\n')
  repo.commit('add greet')
  repo.git('switch', '-c', 'feature')
  repo.write('src/greet.ts', 'export const greet = () => "hi there"\n')
  repo.commit('friendlier greeting')
  repo.git('tag', 'v1.0')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const rows = window.getByTestId('commit-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('friendlier greeting')
  await expect(rows.first()).toContainText('v1.0') // tag badge

  await rows.first().click()
  const details = window.getByTestId('commit-details')
  await expect(details).toContainText('friendlier greeting')
  await details.getByRole('button', { name: /greet\.ts/ }).click()
  await expect(window.getByTestId('diff-viewer')).toContainText('hi there')

  // Switch to side-by-side and check both versions are visible.
  await window.getByRole('button', { name: 'Side-by-side view' }).click()
  await expect(window.getByTestId('diff-viewer')).toContainText('"hello"')
  await expect(window.getByTestId('diff-viewer')).toContainText('hi there')
  await app.close()
})

test('clicking a branch in the sidebar selects its commit', async () => {
  const repo = createRepo()
  repo.git('switch', '-c', 'other')
  repo.write('other.txt', 'x\n')
  repo.commit('work on other')
  repo.git('switch', 'main')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window
    .getByRole('navigation', { name: 'Repository' })
    .getByRole('button', { name: 'other' })
    .click()
  await expect(window.getByTestId('commit-details')).toContainText('work on other')
  await app.close()
})

test('the changes view updates live when files change on disk', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()
  await expect(window.getByText('Your working tree is clean')).toBeVisible()

  // Change files outside the app; the file watcher should notice.
  repo.write('README.md', '# changed\n')
  repo.write('new-file.txt', 'hello\n')
  const list = window.getByTestId('changes-list')
  await expect(list).toContainText('README.md')
  await expect(list).toContainText('new-file.txt')
  await expect(window.getByTestId('change-count')).toHaveText('2')

  await list.getByRole('button', { name: /README\.md/ }).click()
  await expect(window.getByTestId('diff-viewer')).toContainText('# changed')

  // Committing in a terminal should update history too.
  repo.commit('commit from terminal')
  await window.getByRole('tab', { name: /History/ }).click()
  await expect(window.getByTestId('commit-row').first()).toContainText('commit from terminal')
  await app.close()
})

test('clones a repository into a new tab', async () => {
  const source = createRepo()
  const parent = tempDir()
  const { app, window } = await launch()

  await window.getByRole('button', { name: 'Clone' }).click()
  await window.getByLabel('Repository URL').fill(source.path)
  await stubFolderPicker(app, parent)
  await window.getByRole('button', { name: 'Browse' }).click()
  await window.getByLabel('Folder name').fill('my-clone')
  await window.getByRole('button', { name: 'Clone', exact: true }).click()

  await expect(window.getByRole('tab', { name: 'my-clone' })).toBeVisible()
  await expect(window.getByText('initial commit')).toBeVisible()
  expect(existsSync(join(parent, 'my-clone', '.git'))).toBe(true)
  await app.close()
})

test('creates a new repository', async () => {
  const dir = join(tempDir(), 'brand-new')
  const { app, window } = await launch()
  await stubFolderPicker(app, dir)
  await window.getByRole('button', { name: 'New' }).click()
  await expect(window.getByRole('tab', { name: 'brand-new' })).toBeVisible()
  await expect(window.getByText('No commits yet.')).toBeVisible()
  await app.close()
})
