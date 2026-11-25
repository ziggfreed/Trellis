/** Home screen repository management: scanning a folder, and favourites. */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, stubFolderPicker, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('scans a folder and adds the repositories it finds to a workspace', async () => {
  const parent = tempDir()
  for (const name of ['api', 'site', 'tools/cli']) {
    mkdirSync(join(parent, name), { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: join(parent, name) })
  }
  mkdirSync(join(parent, 'not-a-repo'))

  const { app, window } = await launch()
  await stubFolderPicker(app, parent)
  await window.getByRole('button', { name: 'Scan folder…' }).click()

  const dialog = window.getByRole('dialog')
  await expect(dialog).toContainText('Found 3 repositories')
  await dialog.getByRole('checkbox').nth(1).uncheck() // leave out "site"
  await dialog.getByLabel('Workspace name').fill('Scanned')
  await dialog.getByRole('button', { name: 'Add 2 repositories' }).click()

  const workspace = window.getByTestId('workspace-Scanned')
  await expect(workspace.getByRole('listitem')).toHaveCount(2)
  await expect(workspace).toContainText('api')
  await expect(workspace).toContainText('cli')
  await expect(workspace).not.toContainText('site')
  await app.close()
})

test('stars a repository so it shows under Favourites', async () => {
  const repo = createRepo()
  const name = basename(repo.path)
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('button', { name: 'Home' }).click()

  await window.getByTestId('recent-repos').getByRole('listitem').hover()
  await window.getByRole('button', { name: `Add to favourites: ${name}` }).click()
  const favourites = window.getByTestId('favourite-repos')
  await expect(favourites.getByRole('listitem')).toHaveCount(1)
  await expect(favourites).toContainText(name)

  await favourites.getByRole('button', { name: `Remove from favourites: ${name}` }).click()
  await expect(favourites).toBeHidden()
  await app.close()
})
