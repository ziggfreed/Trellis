/** Blame, file history and comparing branches. */
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo } from './helpers'

test.afterAll(cleanupTempDirs)

function repoWithHistory() {
  const repo = createRepo()
  repo.write('app.txt', 'line one\n')
  repo.commit('create app')
  repo.write('app.txt', 'line one\nline two\n')
  repo.commit('add line two')
  repo.git('switch', '-c', 'feature')
  repo.write('feature.txt', 'new feature\n')
  repo.commit('build the feature')
  repo.git('switch', 'main')
  return repo
}

test('shows blame and file history from a file’s menu', async () => {
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByTestId('commit-row').filter({ hasText: 'add line two' }).click()
  await window
    .getByTestId('commit-details')
    .getByRole('button', { name: /app\.txt/ })
    .click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Blame' }).click()

  const blame = window.getByTestId('blame-view')
  await expect(blame).toContainText('create app')
  await expect(blame).toContainText('add line two')

  // Blame before the latest change: only the first line remains.
  await blame.getByRole('button', { name: 'Blame before this change' }).last().click()
  await expect(window.getByText('as it was at')).toBeVisible()
  await expect(blame).not.toContainText('line two')

  await window.getByRole('button', { name: 'History', exact: true }).click()
  const history = window.getByTestId('file-history')
  await expect(history.getByRole('button')).toHaveCount(2)
  await history.getByRole('button', { name: /create app/ }).click()
  await expect(window.getByTestId('diff-viewer')).toContainText('line one')
  await app.close()
})

test('releasing a right-click over a menu item doesn’t pick it', async () => {
  // On macOS (and Linux) the menu opens on mouse-down, so it can appear
  // under the pointer; releasing the button there must not run the item.
  test.skip(process.platform === 'win32', 'Windows opens context menus on mouse-up')
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByTestId('commit-row').filter({ hasText: 'add line two' }).click()
  const file = window.getByTestId('commit-details').getByRole('button', { name: /app\.txt/ })
  await file.hover()
  await window.mouse.down({ button: 'right' })
  const item = window.getByRole('menuitem', { name: 'File history' })
  const box = (await item.boundingBox())!
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await window.mouse.up({ button: 'right' })
  await expect(item).toBeVisible() // the menu is still open
  await expect(window.getByTestId('file-history')).toHaveCount(0)
  await window.keyboard.press('Escape')
  await app.close()
})

test('compares a branch with the current branch', async () => {
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  await sidebar.getByRole('button', { name: 'feature' }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Compare with current branch' }).click()

  const compare = window.getByTestId('compare-view')
  await expect(window.getByTestId('compare-summary')).toHaveText(
    '1 commit ahead, 0 behind · 1 file changed',
  )
  await compare.getByRole('button', { name: /feature\.txt/ }).click()
  await expect(window.getByTestId('diff-viewer')).toContainText('new feature')
  await app.close()
})

test('comparing an older commit shows what changed since it', async () => {
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  // "create app" is already in main, so the comparison is flipped round.
  await window
    .getByTestId('commit-row')
    .filter({ hasText: 'create app' })
    .click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Compare with current branch' }).click()
  await expect(window.getByTestId('compare-view')).toContainText('main compared with')
  await expect(window.getByTestId('compare-summary')).toHaveText(
    '1 commit ahead, 0 behind · 1 file changed',
  )
  await app.close()
})

test('Ctrl/Cmd+click compares two commits', async () => {
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const rows = window.getByTestId('commit-row')
  await rows.filter({ hasText: 'create app' }).click()
  await rows.filter({ hasText: 'build the feature' }).click({ modifiers: ['ControlOrMeta'] })
  await expect(window.getByTestId('compare-summary')).toHaveText(
    '2 commits ahead, 0 behind · 2 files changed',
  )
  await app.close()
})

test('the Compare dialog checks names and opens the comparison', async () => {
  const repo = repoWithHistory()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await window.getByRole('button', { name: 'Compare…' }).click()
  const dialog = window.getByRole('dialog')
  await expect(dialog.getByLabel('With')).toHaveValue('main')
  await dialog.getByLabel('Compare', { exact: true }).fill('nope')
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(dialog).toContainText('No branch, tag or commit called “nope”.')

  await dialog.getByLabel('Compare', { exact: true }).fill('feature')
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(window.getByTestId('compare-summary')).toHaveText(
    '1 commit ahead, 0 behind · 1 file changed',
  )
  await app.close()
})
