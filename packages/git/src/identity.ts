/**
 * The author identity git records on commits (user.name and user.email).
 *
 * Git refuses to commit without one ("Please tell me who you are"), which
 * trips up people new to git. Trellis checks for it up front and offers to
 * set it (see the onboarding card on the home screen).
 */
import { homedir } from 'node:os'
import { runGit } from './run-git'
import type { GitIdentity } from './types'

/** Extra options, mainly so tests can point git at a throwaway config file. */
export interface IdentityOptions {
  env?: Record<string, string>
}

/** Read one config value; null when it isn't set (git exits 1). */
async function readConfig(args: string[], cwd: string, options: IdentityOptions) {
  const result = await runGit(['config', ...args], {
    cwd,
    okExitCodes: [0, 1],
    ...(options.env ? { env: options.env } : {}),
  })
  const value = result.stdout.trim()
  return result.exitCode === 0 && value ? value : null
}

/**
 * The identity commits would use: in `repoPath` if given (a repository can
 * override the global one), otherwise the user's global git config.
 */
export async function getGitIdentity(
  repoPath: string | null,
  options: IdentityOptions = {},
): Promise<GitIdentity> {
  const scope = repoPath ? ['--get'] : ['--global', '--get']
  const cwd = repoPath ?? homedir()
  const [name, email] = await Promise.all([
    readConfig([...scope, 'user.name'], cwd, options),
    readConfig([...scope, 'user.email'], cwd, options),
  ])
  return { name, email }
}

/** Save the identity in the user's global git config (used by every repository). */
export async function setGlobalGitIdentity(
  name: string,
  email: string,
  options: IdentityOptions = {},
): Promise<void> {
  const run = (key: string, value: string) =>
    runGit(['config', '--global', key, value], {
      cwd: homedir(),
      ...(options.env ? { env: options.env } : {}),
    })
  await run('user.name', name)
  await run('user.email', email)
}
