/**
 * Detects a multi-step operation that's in progress (merge, rebase,
 * cherry-pick or revert), usually because it stopped for conflicts, and lets
 * the user continue, skip or abort it.
 *
 * Git records these by leaving files in the .git folder, e.g. MERGE_HEAD
 * during a merge. We find the .git folder with `rev-parse --absolute-git-dir`
 * so it also works for worktrees, where .git is a file pointing elsewhere.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runGit } from './run-git'
import { gitDir } from './git-paths'
import type { RepoOperation } from './types'

export async function getRepoOperation(repoPath: string): Promise<RepoOperation | null> {
  const dir = await gitDir(repoPath)
  const has = (name: string) => existsSync(join(dir, name))
  // Check rebase first: a rebase can stop on a commit and leave other files too.
  if (has('rebase-merge') || has('rebase-apply')) return 'rebase'
  if (has('MERGE_HEAD')) return 'merge'
  if (has('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (has('REVERT_HEAD')) return 'revert'
  return null
}

/** Stop the operation and put everything back as it was before it started. */
export async function abortOperation(repoPath: string, operation: RepoOperation): Promise<void> {
  await runGit([operation, '--abort'], { cwd: repoPath })
}

/**
 * Carry on after conflicts are resolved and staged. Uses git's default
 * commit message (GIT_EDITOR is set to `true`, so no editor opens).
 */
export async function continueOperation(repoPath: string, operation: RepoOperation): Promise<void> {
  await runGit([operation, '--continue'], { cwd: repoPath })
}

/** Skip the current commit (rebase and cherry-pick only). */
export async function skipCommit(
  repoPath: string,
  operation: 'rebase' | 'cherry-pick',
): Promise<void> {
  await runGit([operation, '--skip'], { cwd: repoPath })
}
