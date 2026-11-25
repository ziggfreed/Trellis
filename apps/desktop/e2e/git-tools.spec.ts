/**
 * Housekeeping tools: managing remotes, finding lost commits (reflog),
 * ignoring files, deleting merged branches, and commit signatures.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { cleanupTempDirs, createRepo, launch, openRepo, tempDir } from './helpers'

test.afterAll(cleanupTempDirs)

async function runCommand(window: Page, name: string | RegExp) {
  await window.keyboard.press('ControlOrMeta+k')
  await window.getByPlaceholder('Type a command…').fill(typeof name === 'string' ? name : '')
  await window.getByRole('option', { name }).first().click()
}

/** Fill a one-field text dialog and confirm it. */
async function answer(window: Page, value: string, button: string | RegExp) {
  const dialog = window.getByRole('dialog')
  await dialog.getByRole('textbox').fill(value)
  await dialog.getByRole('button', { name: button }).click()
}

test('adds, renames, re-points and removes a remote', async () => {
  const repo = createRepo()
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  const sidebar = window.getByRole('navigation', { name: 'Repository' })

  await sidebar.getByRole('button', { name: 'Add remote' }).click()
  await answer(window, 'origin', 'Next')
  await answer(window, 'https://example.com/project.git', 'Add remote')
  await expect(sidebar.getByRole('button', { name: /^origin/ })).toBeVisible()

  await sidebar.getByRole('button', { name: /^origin/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Rename…' }).click()
  await answer(window, 'upstream', 'Rename')
  await expect(sidebar.getByRole('button', { name: /^upstream/ })).toBeVisible()

  await sidebar.getByRole('button', { name: /^upstream/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Change URL…' }).click()
  await answer(window, 'git@example.com:me/project.git', 'Save')
  await expect
    .poll(() => repo.git('remote', 'get-url', 'upstream').trim())
    .toBe('git@example.com:me/project.git')

  await sidebar.getByRole('button', { name: /^upstream/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Remove…' }).click()
  await window.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(sidebar.getByRole('button', { name: /^upstream/ })).toBeHidden()
  expect(repo.git('remote').trim()).toBe('')
  await app.close()
})

test('finds a commit lost by a reset and rescues it on a new branch', async () => {
  const repo = createRepo()
  repo.write('a.txt', 'a\n')
  repo.commit('work that gets lost')
  const lost = repo.git('rev-parse', 'HEAD').trim()
  repo.git('reset', '--hard', 'HEAD~1')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await runCommand(window, 'Find lost commits')
  const dialog = window.getByTestId('reflog-dialog')
  await dialog.getByLabel(/Only commits that aren’t on any branch/).check()
  const entry = dialog.getByRole('listitem', { name: /work that gets lost/ })
  await expect(entry).toContainText('not on any branch')
  await entry.getByRole('button', { name: 'Create branch…' }).click()
  await answer(window, 'rescued', 'Create branch')
  const rescued = () => {
    try {
      return repo.git('rev-parse', 'rescued').trim()
    } catch {
      return '' // not created yet
    }
  }
  await expect.poll(rescued).toBe(lost)
  await app.close()
})

test('ignores files by extension, and untracks an ignored committed file', async () => {
  const repo = createRepo()
  repo.write('secret.env', 'token\n')
  repo.commit('add env file')
  repo.write('debug.log', 'log\n')
  repo.write('secret.env', 'new token\n')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)
  await window.getByRole('tab', { name: /Changes/ }).click()

  await window.getByRole('button', { name: /debug\.log/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Ignore' }).click()
  await window.getByRole('menuitem', { name: 'Ignore all *.log files' }).click()
  await expect(window.getByText('Added *.log to .gitignore')).toBeVisible()
  expect(readFileSync(join(repo.path, '.gitignore'), 'utf8')).toBe('*.log\n')

  await window.getByRole('button', { name: /secret\.env/ }).click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Ignore' }).click()
  await window.getByRole('menuitem', { name: 'Ignore this file' }).click()
  const confirm = window.getByRole('dialog')
  await expect(confirm).toContainText('Stop tracking 1 file?')
  await confirm.getByRole('button', { name: 'Stop tracking' }).click()
  await expect.poll(() => repo.git('ls-files', 'secret.env').trim()).toBe('')
  expect(readFileSync(join(repo.path, 'secret.env'), 'utf8')).toBe('new token\n') // still on disk
  await app.close()
})

test('deletes merged branches in one go, and undo brings them back', async () => {
  const repo = createRepo()
  repo.git('branch', 'done-1')
  repo.git('branch', 'done-2')
  repo.git('branch', 'keep-me')
  repo.git('switch', '-c', 'unmerged')
  repo.write('x.txt', 'x\n')
  repo.commit('not merged')
  repo.git('switch', 'main')
  const { app, window } = await launch()
  await openRepo(app, window, repo.path)

  await runCommand(window, /Clean up branches/)
  const dialog = window.getByTestId('prune-dialog')
  // done-1, done-2, keep-me (ticked), and "unmerged" (never pushed, left unticked).
  await expect(dialog.getByRole('checkbox')).toHaveCount(4)
  await expect(dialog.getByRole('checkbox', { name: 'unmerged' })).not.toBeChecked()
  await dialog.getByRole('checkbox', { name: 'keep-me' }).uncheck()
  await dialog.getByRole('button', { name: 'Delete 2 branches' }).click()
  await expect(window.getByText('Deleted 2 branches')).toBeVisible()
  const branches = () => repo.git('branch', '--format=%(refname:short)').trim().split('\n').sort()
  expect(branches()).toEqual(['keep-me', 'main', 'unmerged'])

  await window.keyboard.press('ControlOrMeta+z')
  await expect.poll(branches).toEqual(['done-1', 'done-2', 'keep-me', 'main', 'unmerged'])
  await app.close()
})

/** Whether ssh-keygen can be run (not on the PATH on Windows runners). */
function hasSshKeygen() {
  try {
    execFileSync('ssh-keygen', ['-V'], { stdio: 'ignore' })
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
  return true
}

test('shows a verified SSH signature and saves signing settings', async () => {
  test.skip(!hasSshKeygen(), 'needs ssh-keygen on the PATH')
  const repo = createRepo()
  const keyDir = tempDir()
  const key = join(keyDir, 'id_ed25519')
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key])
  const publicKey = readFileSync(`${key}.pub`, 'utf8').trim()
  const allowed = join(keyDir, 'allowed_signers')
  execFileSync('sh', ['-c', `echo 'test@example.com ${publicKey}' > '${allowed}'`])
  repo.git('config', 'gpg.format', 'ssh')
  // Use plain ssh-keygen, whatever this machine's global git config says.
  repo.git('config', 'gpg.ssh.program', 'ssh-keygen')
  repo.git('config', 'user.signingkey', `${key}.pub`)
  repo.git('config', 'gpg.ssh.allowedSignersFile', allowed)
  repo.write('signed.txt', 'signed\n')
  repo.git('add', '-A')
  repo.git('commit', '-S', '-m', 'a signed commit')

  const gitConfig = join(tempDir(), 'gitconfig')
  const { app, window } = await launch(undefined, { GIT_CONFIG_GLOBAL: gitConfig })
  await openRepo(app, window, repo.path)
  await window.getByTestId('commit-row').filter({ hasText: 'a signed commit' }).click()
  await expect(window.getByTestId('commit-signature')).toHaveText('Verified: test@example.com')
  await window.getByTestId('commit-row').filter({ hasText: 'initial commit' }).click()
  await expect(window.getByTestId('commit-signature')).toBeHidden() // unsigned: nothing shown

  await window.keyboard.press('ControlOrMeta+,')
  const signing = window.getByTestId('signing-settings')
  await signing.getByLabel('Sign my commits').check()
  await signing.getByLabel('Key type').selectOption('ssh')
  await signing.getByLabel('Signing key').fill('~/.ssh/id_ed25519.pub')
  await signing.getByRole('button', { name: 'Save signing settings' }).click()
  await expect(window.getByText('New commits will be signed.')).toBeVisible()
  const saved = readFileSync(gitConfig, 'utf8')
  expect(saved).toContain('gpgsign = true')
  expect(saved).toContain('format = ssh')
  expect(saved).toContain('signingkey = ~/.ssh/id_ed25519.pub')
  await app.close()
})
