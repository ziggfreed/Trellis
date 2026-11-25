/**
 * The reflog: git's diary of where HEAD (or a branch) has pointed. Every
 * commit, checkout, reset, rebase and merge adds an entry, so it's how you
 * find commits that seem lost, e.g. after a reset or a deleted branch.
 * Entries expire after 90 days by default.
 */
import { runGit } from './run-git'
import type { ReflogEntry } from './types'

const FORMAT = '%H%x1f%gD%x1f%gs%x1f%ct%x1f%s'

/** Parse `git reflog show -z --format=<FORMAT>`. */
export function parseReflog(output: string): ReflogEntry[] {
  return output
    .split('\0')
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [sha = '', selector = '', action = '', time = '0', subject = ''] = record
        .replace(/^\n/, '')
        .split('\x1f')
      // The action starts with what happened: "commit: message",
      // "checkout: moving from a to b", "reset: moving to HEAD~1"...
      const colon = action.indexOf(':')
      return {
        sha,
        selector,
        kind: colon > 0 ? action.slice(0, colon).trim() : action.trim(),
        description: colon > 0 ? action.slice(colon + 1).trim() : '',
        date: Number(time) * 1000,
        subject,
      }
    })
}

/**
 * The newest `limit` reflog entries for `ref` (default HEAD). A repository
 * with no reflog yet (e.g. no commits) gives an empty list.
 */
export async function getReflog(
  repoPath: string,
  ref = 'HEAD',
  limit = 300,
): Promise<ReflogEntry[]> {
  const result = await runGit(
    ['reflog', 'show', '-z', `--format=${FORMAT}`, `-n${limit}`, ref, '--'],
    { cwd: repoPath, okExitCodes: [0, 128] },
  )
  return result.exitCode === 0 ? parseReflog(result.stdout) : []
}

/**
 * Which of `shas` are on no branch, tag or stash, i.e. would be lost when
 * the reflog expires. One git command for the whole list: it lists every
 * commit reachable from `shas` but not from any ref, and we keep the ones
 * that were asked about.
 */
export async function findUnreachable(repoPath: string, shas: string[]): Promise<Set<string>> {
  const unique = [...new Set(shas)].filter((sha) => /^[0-9a-f]{7,64}$/i.test(sha))
  if (!unique.length) return new Set()
  const result = await runGit(['rev-list', ...unique, '--not', '--all'], {
    cwd: repoPath,
    okExitCodes: [0, 128], // 128: a commit was garbage-collected
  })
  if (result.exitCode !== 0) return new Set()
  const asked = new Set(unique)
  return new Set(result.stdout.split('\n').filter((sha) => asked.has(sha)))
}
