/**
 * Git worktrees: extra working folders for the same repository, each with
 * its own checked-out branch. Handy for working on two branches at once
 * (or letting a coding agent work in one while you use another).
 */
import { runGit } from './run-git'
import type { Worktree } from './types'

/**
 * Parse `git worktree list --porcelain`. Each worktree is a block of lines
 * separated by a blank line:
 *
 *   worktree /path/to/repo
 *   HEAD 1a2b3c...
 *   branch refs/heads/main      (or "detached")
 *   locked <reason>             (optional)
 *   prunable <reason>           (optional: the folder is gone)
 */
export function parseWorktrees(output: string): Worktree[] {
  const worktrees: Worktree[] = []
  for (const block of output.split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean)
    if (!lines[0]?.startsWith('worktree ')) continue
    const field = (name: string) => {
      const line = lines.find((l) => l === name || l.startsWith(`${name} `))
      return line === undefined ? undefined : line.slice(name.length + 1)
    }
    const branch = field('branch')
    worktrees.push({
      path: lines[0].slice('worktree '.length),
      head: field('HEAD') ?? null,
      branch: branch ? branch.replace(/^refs\/heads\//, '') : null,
      isMain: worktrees.length === 0, // git always lists the main worktree first
      bare: field('bare') !== undefined,
      locked: field('locked') !== undefined,
      prunable: field('prunable') !== undefined,
    })
  }
  return worktrees
}

export async function getWorktrees(repoPath: string): Promise<Worktree[]> {
  const { stdout } = await runGit(['worktree', 'list', '--porcelain'], { cwd: repoPath })
  return parseWorktrees(stdout).filter((w) => !w.bare)
}

/**
 * Create a worktree at `path`.
 * - `branch`: check out this existing branch there, or
 * - `newBranch`: create this branch (from `startPoint`, default HEAD) and check it out.
 */
export async function addWorktree(
  repoPath: string,
  path: string,
  options: { branch?: string; newBranch?: string; startPoint?: string },
): Promise<void> {
  const args = ['worktree', 'add']
  if (options.newBranch)
    args.push(
      '-b',
      options.newBranch,
      '--',
      path,
      ...(options.startPoint ? [options.startPoint] : []),
    )
  else if (options.branch) args.push('--', path, options.branch)
  else throw new Error('Choose a branch for the worktree.')
  await runGit(args, { cwd: repoPath })
}

/**
 * Remove a worktree's folder and git's record of it. Without `force`, git
 * refuses if it has uncommitted changes.
 */
export async function removeWorktree(repoPath: string, path: string, force = false): Promise<void> {
  await runGit(['worktree', 'remove', ...(force ? ['--force'] : []), '--', path], { cwd: repoPath })
}

/** Forget worktrees whose folders were deleted by hand. */
export async function pruneWorktrees(repoPath: string): Promise<void> {
  await runGit(['worktree', 'prune'], { cwd: repoPath })
}
