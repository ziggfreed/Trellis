/**
 * Git LFS (Large File Storage): big files (images, videos, builds) are kept
 * on a server, and the repository only stores a small "pointer" file for
 * each. Which files use LFS is set by `filter=lfs` patterns in
 * .gitattributes; the `git lfs` command (a separate install) does the
 * uploading and downloading as part of normal fetch/pull/push/checkout.
 *
 * LFS servers can also "lock" files that can't be merged (e.g. a .psd), so
 * two people don't edit the same one.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './run-git'
import type { LfsLock } from './types'

/** The `git lfs` version, or null when it isn't installed. */
export async function getLfsVersion(repoPath: string): Promise<string | null> {
  try {
    const result = await runGit(['lfs', 'version'], { cwd: repoPath, okExitCodes: [0, 1] })
    const match = /git-lfs\/(\S+)/.exec(result.stdout)
    return result.exitCode === 0 && match ? match[1]! : null
  } catch {
    return null
  }
}

/** Patterns marked `filter=lfs` in a .gitattributes file's text. */
export function parseLfsPatterns(gitattributes: string): string[] {
  return gitattributes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
    .filter(([, ...attrs]) => attrs.includes('filter=lfs'))
    .map(([pattern]) => pattern!)
}

/**
 * The LFS patterns in the root .gitattributes. Read directly (not through
 * `git lfs track`), so it works even when git-lfs isn't installed, which is
 * exactly when Trellis needs to warn about it.
 */
export async function getLfsPatterns(repoPath: string): Promise<string[]> {
  try {
    return parseLfsPatterns(await readFile(join(repoPath, '.gitattributes'), 'utf8'))
  } catch {
    return []
  }
}

/** Store files matching `pattern` (e.g. "*.psd") with LFS from now on (edits .gitattributes). */
export async function lfsTrack(repoPath: string, pattern: string): Promise<void> {
  await runGit(['lfs', 'track', '--', pattern], { cwd: repoPath })
}

/** Stop using LFS for `pattern` (edits .gitattributes; existing files aren't converted back). */
export async function lfsUntrack(repoPath: string, pattern: string): Promise<void> {
  await runGit(['lfs', 'untrack', '--', pattern], { cwd: repoPath })
}

/** Parse `git lfs locks --json`. */
export function parseLfsLocks(json: string): LfsLock[] {
  const raw = JSON.parse(json || '[]') as {
    id: string
    path: string
    owner?: { name?: string }
    locked_at?: string
  }[]
  return raw.map((lock) => ({
    id: String(lock.id),
    path: lock.path,
    owner: lock.owner?.name ?? '',
    lockedAt: lock.locked_at ? Date.parse(lock.locked_at) : 0,
  }))
}

/** Files locked on the LFS server (throws if the server doesn't support locking). */
export async function getLfsLocks(repoPath: string): Promise<LfsLock[]> {
  const { stdout } = await runGit(['lfs', 'locks', '--json'], { cwd: repoPath })
  return parseLfsLocks(stdout)
}

export async function lfsLock(repoPath: string, path: string): Promise<void> {
  await runGit(['lfs', 'lock', '--', path], { cwd: repoPath })
}

/** Release a lock. `force` releases someone else's (if the server allows it). */
export async function lfsUnlock(repoPath: string, path: string, force = false): Promise<void> {
  await runGit(['lfs', 'unlock', ...(force ? ['--force'] : []), '--', path], { cwd: repoPath })
}

export { parseLfsPointer } from './lfs-pointer'
