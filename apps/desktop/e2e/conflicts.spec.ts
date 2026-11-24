/** Resolving merge conflicts in the built-in editor, then finishing the merge. */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, type TestRepo } from './helpers'

test.afterAll(cleanupTempDirs)

/** main and other both change README.md; other also deletes notes.txt, which main edits. */
function conflictingRepo(): TestRepo {
  const repo = createRepo()
  repo.write('notes.txt', 'v1\n')
  repo.commit('add notes')
  repo.git('switch', '-c', 'other')
  repo.write('README.md', '# test\nfrom other\n')
  rmSync(join(repo.path, 'notes.txt'))
  repo.commit('other changes')
  repo.git('switch', 'main')
  repo.write('README.md', '# test\nfrom main\n')
  repo.write('notes.txt', 'v2\n')
  repo.commit('main changes')
  try {
    repo.git('merge', 'other')
  } catch {
    // Expected: the merge stops with conflicts.
  }
  return repo
}

test('resolves conflicts in the editor and finishes the merge', async () => {
  const repo = conflictingRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  const banner = window.getByTestId('operation-banner')
  await expect(banner).toContainText('2 files have conflicts')
  await banner.getByRole('button', { name: 'Show conflicts' }).click()

  // Line-by-line conflict in README.md: keep both versions.
  const conflicts = window.getByRole('region', { name: 'Conflicts', exact: true })
  await conflicts.getByRole('button', { name: /README\.md/ }).click()
  const editor = window.getByTestId('conflict-editor')
  await expect(editor).toContainText('0 of 1 conflict resolved')
  await editor.getByRole('button', { name: 'Use both' }).click()
  await editor.getByRole('button', { name: 'Save and mark resolved' }).click()
  await expect(window.getByText('Resolved README.md')).toBeVisible()
  expect(readFileSync(join(repo.path, 'README.md'), 'utf8')).toBe('# test\nfrom main\nfrom other\n')

  // notes.txt was deleted on one side: choose a whole-file version.
  await conflicts.getByRole('button', { name: /notes\.txt/ }).click()
  await window.getByRole('button', { name: 'Keep current version' }).click()
  await expect(banner).toContainText('All conflicts are resolved')

  await banner.getByRole('button', { name: 'Continue' }).click()
  await expect(banner).toBeHidden()
  expect(repo.git('log', '-1', '--format=%P').trim().split(' ')).toHaveLength(2) // a merge commit
  expect(readFileSync(join(repo.path, 'notes.txt'), 'utf8')).toBe('v2\n')
  await app.close()
})
