/**
 * Deleting tags from the sidebar: only here, or here and on the remote.
 */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

/** A repository with a bare "origin": v1 and v2 pushed, v3 only local. */
function repoWithTags() {
  const repo = createRepo()
  const remote = join(tempDir(), 'origin.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  repo.git('remote', 'add', 'origin', remote)
  for (const tag of ['v1', 'v2', 'v3']) repo.git('tag', tag)
  repo.git('push', '-q', 'origin', 'main', 'v1', 'v2')
  const remoteTags = () =>
    execFileSync('git', ['tag', '--list'], { cwd: remote, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  return { repo, remoteTags }
}

const sidebar = (window: Page) => window.getByRole('navigation', { name: 'Repository' })

async function deleteTag(window: Page, tag: string, alsoOnRemote: boolean | null) {
  await sidebar(window).getByRole('button', { name: tag, exact: true }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Delete…' }).click()
  const dialog = window.getByRole('dialog', { name: `Delete tag ${tag}?` })
  const checkbox = dialog.getByRole('checkbox', { name: 'Also delete it on origin' })
  if (alsoOnRemote === null) await expect(checkbox).toHaveCount(0)
  else if (alsoOnRemote) await checkbox.check()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(sidebar(window).getByRole('button', { name: tag, exact: true })).toBeHidden()
}

test('deletes a tag here only, or on the remote too', async () => {
  const { repo, remoteTags } = repoWithTags()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await sidebar(window).getByRole('button', { name: /^Tags/ }).click()

  // Unticked (the default): the remote keeps it.
  await deleteTag(window, 'v1', false)
  expect(remoteTags()).toEqual(['v1', 'v2'])

  // Ticked: gone from the remote as well.
  await deleteTag(window, 'v2', true)
  await expect.poll(remoteTags).toEqual(['v1'])
  await expect(window.getByText('Deleted tag v2 here and on origin')).toBeVisible()

  // Ticked for a tag that was never pushed: deleted here, and says so.
  await deleteTag(window, 'v3', true)
  await expect(window.getByText('Deleted tag v3 (origin didn’t have it)')).toBeVisible()
  expect(repo.git('tag', '--list').trim()).toBe('')
  await app.close()
})

test('without a remote, there is no option to delete it there', async () => {
  const repo = createRepo()
  repo.git('tag', 'v1')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await sidebar(window).getByRole('button', { name: /^Tags/ }).click()
  await deleteTag(window, 'v1', null)
  await app.close()
})
