/**
 * Commit signing (GPG or SSH): checking a commit's signature, and the
 * global settings that make git sign new commits.
 *
 * Trellis doesn't sign anything itself: with `commit.gpgsign` on, every
 * `git commit` it runs is signed by git, using gpg or ssh-keygen exactly as
 * on the command line (so passphrases go through gpg-agent / ssh-agent).
 */
import { homedir } from 'node:os'
import { runGit } from './run-git'
import type { CommitSignature, SigningConfig } from './types'
import type { IdentityOptions } from './identity'

/**
 * What git's `%G?` letter means:
 *   G good · U good, but the key isn't trusted · X good, signature expired
 *   Y good, key expired · R good, key revoked · B bad (tampered)
 *   E can't check (e.g. the key isn't known here) · N not signed
 */
export function signatureStatus(letter: string): CommitSignature['status'] {
  switch (letter) {
    case 'G':
      return 'good'
    case 'U':
    case 'X':
    case 'Y':
    case 'R':
      return 'untrusted'
    case 'B':
      return 'bad'
    case 'E':
      return 'unknown'
    default:
      return 'none'
  }
}

/** Parse `git log -1 --format=%G?%x00%GS%x00%GK`. */
export function parseSignature(output: string): CommitSignature {
  const [letter = 'N', signer = '', key = ''] = output.replace(/\n$/, '').split('\0')
  const status = signatureStatus(letter.trim())
  return status === 'none'
    ? { status }
    : { status, signer: signer.trim() || null, key: key.trim() || null }
}

/**
 * The signature on one commit. Checking runs gpg / ssh-keygen, so it's done
 * for the selected commit only, not for every row in the history.
 */
export async function getCommitSignature(repoPath: string, sha: string): Promise<CommitSignature> {
  const { stdout } = await runGit(['log', '-1', '--format=%G?%x00%GS%x00%GK', sha, '--'], {
    cwd: repoPath,
  })
  return parseSignature(stdout)
}

async function globalConfig(key: string, options: IdentityOptions) {
  const result = await runGit(['config', '--global', '--get', key], {
    cwd: homedir(),
    okExitCodes: [0, 1],
    ...(options.env ? { env: options.env } : {}),
  })
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

/** The global signing settings. */
export async function getSigningConfig(options: IdentityOptions = {}): Promise<SigningConfig> {
  const [sign, format, key] = await Promise.all([
    globalConfig('commit.gpgsign', options),
    globalConfig('gpg.format', options),
    globalConfig('user.signingkey', options),
  ])
  return {
    signCommits: sign === 'true',
    format: format === 'ssh' ? 'ssh' : 'openpgp',
    key,
  }
}

/**
 * Save the global signing settings. An empty key is removed from the config
 * (gpg then picks the key matching the commit email).
 */
export async function setSigningConfig(
  config: SigningConfig,
  options: IdentityOptions = {},
): Promise<void> {
  const run = (args: string[], okExitCodes = [0]) =>
    runGit(['config', '--global', ...args], {
      cwd: homedir(),
      okExitCodes,
      ...(options.env ? { env: options.env } : {}),
    })
  await run(['commit.gpgsign', String(config.signCommits)])
  await run(['gpg.format', config.format])
  if (config.key.trim()) await run(['user.signingkey', config.key.trim()])
  else await run(['--unset', 'user.signingkey'], [0, 5]) // 5: wasn't set
}
