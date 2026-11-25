/**
 * Finding local branches that are already merged, so they can be deleted
 * in one go ("clean up merged branches").
 *
 * "Merged into X" means every commit on the branch is also on X, so
 * deleting it loses nothing: git's own `git branch -d` accepts it.
 */
import { runGit } from './run-git'

/** Branch names never offered for deletion, whatever they're merged into. */
export const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'development', 'dev', 'trunk']

/**
 * The repository's main branch: what the remote "origin" calls its default
 * (origin/HEAD), else a local main/master, else null.
 */
export async function getDefaultBranch(repoPath: string): Promise<string | null> {
  const remoteHead = await runGit(['symbolic-ref', '--short', '-q', 'refs/remotes/origin/HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  const fromRemote = remoteHead.stdout.trim().replace(/^origin\//, '')
  const locals = await runGit(['branch', '--format=%(refname:short)'], { cwd: repoPath })
  const names = new Set(locals.stdout.split('\n').filter(Boolean))
  if (fromRemote && names.has(fromRemote)) return fromRemote
  return ['main', 'master'].find((name) => names.has(name)) ?? null
}

/** Parse `git branch --format=%(refname:short)%00%(HEAD)%00%(worktreepath)`. */
export function parseBranchList(output: string) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', head = '', worktree = ''] = line.split('\0')
      return { name, current: head === '*', inWorktree: worktree !== '' }
    })
}

/**
 * Local branches fully merged into `target` that are safe to delete: not
 * `target` itself, not checked out (here or in another worktree), and not a
 * long-lived branch like main or develop.
 */
export async function getMergedBranches(repoPath: string, target: string): Promise<string[]> {
  const { stdout } = await runGit(
    ['branch', '--format=%(refname:short)%00%(HEAD)%00%(worktreepath)', '--merged', target, '--'],
    { cwd: repoPath },
  )
  return parseBranchList(stdout)
    .filter(
      (b) =>
        b.name !== target && !b.current && !b.inWorktree && !PROTECTED_BRANCHES.includes(b.name),
    )
    .map((b) => b.name)
    .sort((a, b) => a.localeCompare(b))
}
