/** First run: asking for the git name and email commits will use. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cleanupTempDirs, launch, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

test('asks for a git name and email when none is set, and saves them', async () => {
  // An empty global git config, so this machine's real one isn't used or changed.
  const gitConfig = join(tempDir(), 'gitconfig')
  const { app, window } = await launch(undefined, { GIT_CONFIG_GLOBAL: gitConfig })

  const card = window.getByTestId('git-setup-card')
  await expect(card).toContainText('Tell git who you are')
  await card.getByRole('button', { name: 'Set up' }).click()

  const dialog = window.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Ada Lovelace')
  await dialog.getByLabel('Email').fill('ada.example.com')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('That doesn’t look like an email address.')

  await dialog.getByLabel('Email').fill('ada@example.com')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(card).toBeHidden()
  const saved = readFileSync(gitConfig, 'utf8')
  expect(saved).toContain('name = Ada Lovelace')
  expect(saved).toContain('email = ada@example.com')
  await app.close()
})
