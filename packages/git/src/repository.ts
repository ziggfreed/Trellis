/**
 * Basic questions about a repository: where is its root, what branch is
 * checked out, and so on.
 */
import { GitError, runGit } from './run-git'
import type { HeadState } from './types'

/**
 * Return the top-level folder of the repository containing `path`, or null if
 * `path` is not inside a git repository.
 */
export async function getRepoRoot(path: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(['rev-parse', '--show-toplevel'], { cwd: path })
    return stdout.trim() || null
  } catch (err) {
    // Not a repo (git exits 128), or the folder doesn't exist (spawn fails).
    if (err instanceof GitError && !err.notInstalled) return null
    throw err
  }
}

export async function getHead(repoPath: string): Promise<HeadState> {
  // `symbolic-ref` succeeds when HEAD points at a branch (even an unborn one)
  // and exits 1 when HEAD is detached.
  const branch = await runGit(['symbolic-ref', '--short', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1],
  })
  // `rev-parse --verify` exits 1/128 when HEAD has no commit yet.
  const commit = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  const sha = commit.exitCode === 0 ? commit.stdout.trim() : null

  if (branch.exitCode === 0) {
    return { kind: 'branch', name: branch.stdout.trim(), unborn: sha === null }
  }
  if (sha === null) throw new GitError('HEAD is detached but points at no commit', ['HEAD'])
  return { kind: 'detached', sha }
}
