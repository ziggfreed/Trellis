/**
 * A cheap "has anything changed?" check for a repository's branches, tags
 * and HEAD, made from file modification times rather than git commands.
 *
 * WHY: when the file watcher finishes starting on a repository (which can
 * take seconds on Windows), something may have changed in the meantime, so
 * it used to refresh everything. That re-ran a dozen git commands every
 * time a repository opened, almost always for nothing. Comparing this
 * fingerprint from when watching started with one taken when it's ready
 * tells us whether that full refresh is needed.
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import * as git from '@trellis/git'

/** Files whose change means branches, HEAD or an in-progress operation changed. */
const FILES = ['HEAD', 'packed-refs', 'FETCH_HEAD', 'ORIG_HEAD', 'MERGE_HEAD', 'REBASE_HEAD']

async function stamp(path: string): Promise<string> {
  try {
    const info = await stat(path)
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return '-' // missing
  }
}

/**
 * A string that changes when the repository's refs or HEAD change. Paths
 * come from `git rev-parse --git-path` (cached), so worktrees work too.
 */
export async function refsFingerprint(repoPath: string): Promise<string> {
  const parts: string[] = []
  const [refs, ...files] = await git.gitPathsOf(repoPath, ['refs', ...FILES])
  for (const [i, path] of files.entries()) parts.push(`${FILES[i]}=${await stamp(path!)}`)
  // Every loose ref file (branches, tags, remote branches, the stash).
  try {
    const entries = await readdir(refs!, { recursive: true, withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const path = join(entry.parentPath, entry.name)
      parts.push(`${path}=${await stamp(path)}`)
    }
  } catch {
    parts.push('refs=-')
  }
  return parts.sort().join('\n')
}
