/**
 * Files and lines changed per commit, for the history's "Changes" column.
 *
 * Working this out means diffing each commit, which is too slow to do for a
 * whole history up front, so the UI asks for just the rows on screen.
 */
import { runGit } from './run-git'
import type { CommitStats } from './types'

/**
 * Parse `git log --format=%x00%H --numstat` output. Each commit starts with
 * a NUL and its hash; each changed file is "<added>\t<deleted>\t<path>",
 * with "-" for both counts when the file is binary.
 */
export function parseCommitStats(output: string): Record<string, CommitStats> {
  const stats: Record<string, CommitStats> = {}
  for (const record of output.split('\0')) {
    const [sha, ...lines] = record.trim().split('\n')
    if (!sha) continue
    const entry = { files: 0, insertions: 0, deletions: 0 }
    for (const line of lines) {
      const match = /^(\d+|-)\t(\d+|-)\t/.exec(line)
      if (!match) continue
      entry.files++
      entry.insertions += Number(match[1]) || 0
      entry.deletions += Number(match[2]) || 0
    }
    stats[sha] = entry
  }
  return stats
}

/**
 * Changes per commit for the given hashes. Merges are compared with their
 * first parent, which shows what the merge brought into the branch.
 */
export async function getCommitStats(
  repoPath: string,
  shas: string[],
): Promise<Record<string, CommitStats>> {
  if (shas.length === 0) return {}
  // Hashes go in on stdin, so a long list can't hit command-line length limits.
  const { stdout } = await runGit(
    [
      'log',
      '--stdin',
      '--no-walk=unsorted',
      '--diff-merges=first-parent',
      '--no-renames',
      '--format=%x00%H',
      '--numstat',
    ],
    { cwd: repoPath, stdin: shas.join('\n') + '\n' },
  )
  return parseCommitStats(stdout)
}
