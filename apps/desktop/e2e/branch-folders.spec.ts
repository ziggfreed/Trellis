/** Branches named with slashes are grouped into (nested) folders in the sidebar. */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('groups branches into folders that expand, nested, for local and remote branches', async () => {
  const remote = join(tempDir(), 'remote.git')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
  const repo = createRepo()
  repo.git('remote', 'add', 'origin', remote)
  for (const name of ['feature/login', 'feature/search', 'team/ann/fix', 'team/ben']) {
    repo.git('branch', name)
  }
  repo.git('push', '-q', 'origin', 'main', 'feature/login')
  repo.git('switch', '-q', 'feature/login')

  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const sidebar = window.getByRole('navigation', { name: 'Repository' })
  const local = sidebar.getByRole('group', { name: 'feature folder' }).first()

  // The folder with the checked-out branch starts open; the others closed.
  await expect(local.getByRole('button', { name: /^feature/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(local.getByRole('button', { name: /^Current branch login/ })).toBeVisible()
  const team = sidebar.getByRole('group', { name: 'team folder' })
  await expect(team.getByRole('button', { name: /^team/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await expect(sidebar.getByRole('button', { name: /^ben/ })).toBeHidden()

  // Folders open to show branches and subfolders.
  await team.getByRole('button', { name: /^team/ }).click()
  await expect(team.getByRole('button', { name: /^ben/ })).toBeVisible()
  const ann = sidebar.getByRole('group', { name: 'team/ann folder' })
  await ann.getByRole('button', { name: /^ann/ }).click()
  await expect(ann.getByRole('button', { name: /^fix/ })).toBeVisible()

  // Branches in folders work as before: double-click to check out.
  await local.getByRole('button', { name: /^search/ }).dblclick()
  await expect.poll(() => repo.git('branch', '--show-current').trim()).toBe('feature/search')

  // Remote branches are grouped the same way, under their remote.
  const remoteFolder = sidebar.getByRole('group', { name: 'feature folder' }).nth(1)
  await remoteFolder.getByRole('button', { name: /^feature/ }).click()
  await expect(remoteFolder.getByRole('button', { name: /^login/ })).toBeVisible()
  await app.close()
})
