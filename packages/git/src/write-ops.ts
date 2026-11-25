/**
 * Operations that change a repository: committing, branches, merging,
 * stashes, tags, cherry-pick/revert/reset, and fetch/pull/push.
 *
 * Each function is a thin, typed wrapper around one git command. Errors
 * from git are thrown as GitError with git's own message, which is usually
 * clear enough to show the user directly.
 */
import { GitError, runGit, type RunGitOptions } from './run-git'
import { parseCloneProgress, type CloneProgress } from './clone'
import { getRepoOperation } from './repo-state'
import type { MergeResult } from './types'

// ---------------------------------------------------------------------------
// Committing
// ---------------------------------------------------------------------------

export interface CommitOptions {
  /** Replace the last commit instead of adding a new one. */
  amend?: boolean
}

/**
 * Commit what's staged. Returns the new commit's hash.
 *
 * The message is passed on stdin (`-F -`) so any characters are safe.
 * `--cleanup=whitespace` trims blank lines but keeps lines starting with
 * "#", which git would otherwise delete (they're common: "#123 fix bug").
 * Commit hooks (e.g. pre-commit) run as usual; if one fails, its output is
 * in the thrown error.
 */
export async function commit(
  repoPath: string,
  message: string,
  options: CommitOptions = {},
): Promise<string> {
  if (message.trim() === '') throw new GitError('The commit message is empty.', ['commit'])
  await runGit(
    ['commit', '--cleanup=whitespace', '-F', '-', ...(options.amend ? ['--amend'] : [])],
    { cwd: repoPath, stdin: message },
  )
  const { stdout } = await runGit(['rev-parse', 'HEAD'], { cwd: repoPath })
  return stdout.trim()
}

/** The full message of the HEAD commit (to pre-fill "amend"), or null if there are no commits. */
export async function getHeadMessage(repoPath: string): Promise<string | null> {
  const result = await runGit(['log', '-1', '--format=%B'], {
    cwd: repoPath,
    okExitCodes: [0, 128],
  })
  return result.exitCode === 0 ? result.stdout.trim() : null
}

// ---------------------------------------------------------------------------
// Branches and checkout
// ---------------------------------------------------------------------------

/** Create a branch at `startPoint` (default HEAD), optionally switching to it. */
export async function createBranch(
  repoPath: string,
  name: string,
  options: { startPoint?: string; checkout?: boolean } = {},
): Promise<void> {
  const start = options.startPoint ? [options.startPoint] : []
  const args = options.checkout ? ['switch', '-c', name, ...start] : ['branch', name, ...start]
  await runGit(args, { cwd: repoPath })
}

/** Switch to a local branch. */
export async function checkoutBranch(repoPath: string, name: string): Promise<void> {
  await runGit(['switch', name], { cwd: repoPath })
}

/**
 * Check out a remote branch such as "origin/feature": switch to the local
 * branch "feature", creating it (tracking the remote one) if needed.
 */
export async function checkoutRemoteBranch(
  repoPath: string,
  remoteBranch: string,
  localName: string,
): Promise<void> {
  const exists = await runGit(['rev-parse', '--verify', '-q', `refs/heads/${localName}`], {
    cwd: repoPath,
    okExitCodes: [0, 1],
  })
  if (exists.exitCode === 0) await runGit(['switch', localName], { cwd: repoPath })
  else await runGit(['switch', '-c', localName, '--track', remoteBranch], { cwd: repoPath })
}

/** Check out a commit directly ("detached HEAD"). */
export async function checkoutCommit(repoPath: string, sha: string): Promise<void> {
  await runGit(['switch', '--detach', sha], { cwd: repoPath })
}

export async function renameBranch(repoPath: string, from: string, to: string): Promise<void> {
  await runGit(['branch', '-m', from, to], { cwd: repoPath })
}

/**
 * Point a branch at a different commit (`git branch --force`), without
 * checking anything out. Git refuses this for the checked-out branch; use
 * reset for that.
 */
export async function moveBranch(repoPath: string, name: string, target: string): Promise<void> {
  await runGit(['branch', '--force', name, target], { cwd: repoPath })
}

/**
 * Delete a local branch. Without `force`, git refuses if the branch has
 * commits that aren't merged anywhere (so nothing is lost by accident).
 */
export async function deleteBranch(repoPath: string, name: string, force = false): Promise<void> {
  await runGit(['branch', force ? '-D' : '-d', name], { cwd: repoPath })
}

/**
 * Run a command that may stop with conflicts (merge, rebase, cherry-pick,
 * revert, pull, stash apply). If it fails AND the repository is now in the
 * middle of an operation, that's conflicts for the user to resolve, not an
 * error.
 */
async function runMayConflict(
  repoPath: string,
  args: string[],
  options: Partial<RunGitOptions> = {},
): Promise<MergeResult> {
  try {
    await runGit(args, { cwd: repoPath, ...options })
    return { status: 'done' }
  } catch (error) {
    if ((await getRepoOperation(repoPath)) !== null) return { status: 'conflicts' }
    throw error
  }
}

/** Merge `ref` into the current branch. */
export function merge(
  repoPath: string,
  ref: string,
  options: { noFastForward?: boolean } = {},
): Promise<MergeResult> {
  return runMayConflict(repoPath, [
    'merge',
    '--no-edit',
    ...(options.noFastForward ? ['--no-ff'] : []),
    ref,
  ])
}

/**
 * Rebase the current branch onto `onto`. With `updateRefs`, other local
 * branches pointing into the rebased commits move with them (a "stack" of
 * branches, see stacks.ts; needs git 2.38 or later).
 */
export function rebase(
  repoPath: string,
  onto: string,
  options: { updateRefs?: boolean } = {},
): Promise<MergeResult> {
  return runMayConflict(repoPath, [
    'rebase',
    ...(options.updateRefs ? ['--update-refs'] : []),
    onto,
  ])
}

// ---------------------------------------------------------------------------
// Commits: cherry-pick, revert, reset
// ---------------------------------------------------------------------------

/** Is this commit a merge (more than one parent)? Merges need `-m 1` to cherry-pick or revert. */
async function isMerge(repoPath: string, sha: string): Promise<boolean> {
  const { stdout } = await runGit(['rev-list', '--parents', '-n', '1', sha], { cwd: repoPath })
  return stdout.trim().split(' ').length > 2
}

export async function cherryPick(repoPath: string, sha: string): Promise<MergeResult> {
  const mainline = (await isMerge(repoPath, sha)) ? ['-m', '1'] : []
  return runMayConflict(repoPath, ['cherry-pick', ...mainline, sha])
}

export async function revert(repoPath: string, sha: string): Promise<MergeResult> {
  const mainline = (await isMerge(repoPath, sha)) ? ['-m', '1'] : []
  return runMayConflict(repoPath, ['revert', '--no-edit', ...mainline, sha])
}

/**
 * Move the current branch to `sha`.
 * - soft:  keep all changes staged
 * - mixed: keep all changes, unstaged (git's default)
 * - hard:  throw away all changes (can't be undone from the working tree)
 */
export async function reset(
  repoPath: string,
  sha: string,
  mode: 'soft' | 'mixed' | 'hard',
): Promise<void> {
  await runGit(['reset', `--${mode}`, sha], { cwd: repoPath })
}

// ---------------------------------------------------------------------------
// Stashes
// ---------------------------------------------------------------------------

/**
 * Stash the working tree and index. Returns false if there was nothing to
 * stash (git reports success in that case, so we check its message).
 */
/**
 * Stash changes. With `paths`, only those files are stashed (both their
 * staged and unstaged changes); everything else stays as it is, so you can
 * put some files aside and commit the rest. Returns false if there was
 * nothing to stash.
 */
export async function stashPush(
  repoPath: string,
  options: { message?: string; includeUntracked?: boolean; paths?: string[] } = {},
): Promise<boolean> {
  const args = ['stash', 'push']
  if (options.includeUntracked) args.push('--include-untracked')
  if (options.message) args.push('-m', options.message)
  const paths = options.paths ?? []
  // Paths go on stdin (NUL-separated) so a long selection can't hit
  // command-line length limits, and odd file names are taken literally.
  if (paths.length) args.push('--pathspec-from-file=-', '--pathspec-file-nul')
  const { stdout } = await runGit(args, {
    cwd: repoPath,
    ...(paths.length ? { stdin: paths.join('\0'), env: { GIT_LITERAL_PATHSPECS: '1' } } : {}),
  })
  return !stdout.includes('No local changes to save')
}

export function stashApply(repoPath: string, index: number): Promise<MergeResult> {
  return runMayConflict(repoPath, ['stash', 'apply', `stash@{${index}}`])
}

/** Apply a stash and remove it (git keeps it if applying causes conflicts). */
export function stashPop(repoPath: string, index: number): Promise<MergeResult> {
  return runMayConflict(repoPath, ['stash', 'pop', `stash@{${index}}`])
}

export async function stashDrop(repoPath: string, index: number): Promise<void> {
  await runGit(['stash', 'drop', `stash@{${index}}`], { cwd: repoPath })
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Create a tag at `sha`. With a message it's an annotated tag, otherwise lightweight. */
export async function createTag(
  repoPath: string,
  name: string,
  sha: string,
  message?: string,
): Promise<void> {
  const args = message ? ['tag', '-a', name, '-m', message, sha] : ['tag', name, sha]
  await runGit(args, { cwd: repoPath })
}

export async function deleteTag(repoPath: string, name: string): Promise<void> {
  await runGit(['tag', '-d', name], { cwd: repoPath })
}

// ---------------------------------------------------------------------------
// Remotes: fetch, pull, push
// ---------------------------------------------------------------------------

export interface RemoteOptions {
  onProgress?: (progress: CloneProgress) => void
  signal?: AbortSignal
  /** Extra environment variables (e.g. to stop background fetches prompting for passwords). */
  env?: Record<string, string>
}

/** runGit options for a network command: cancellation and progress parsing. */
export function remoteRunOptions(repoPath: string, options: RemoteOptions): RunGitOptions {
  return {
    cwd: repoPath,
    signal: options.signal,
    ...(options.env ? { env: options.env } : {}),
    onStderr: (chunk) => {
      const progress = parseCloneProgress(chunk)
      if (progress) options.onProgress?.(progress)
    },
  }
}

/** Fetch from one remote, or all remotes. `--prune` removes branches deleted on the remote. */
export async function fetch(
  repoPath: string,
  remote: string | 'all',
  options: RemoteOptions = {},
): Promise<void> {
  const target = remote === 'all' ? ['--all'] : [remote]
  await runGit(['fetch', '--progress', '--prune', ...target], remoteRunOptions(repoPath, options))
}

/**
 * Pull the current branch's upstream. We always say whether to merge or
 * rebase, because recent git versions refuse to guess when branches have diverged.
 */
export async function pull(
  repoPath: string,
  options: RemoteOptions & { rebase?: boolean } = {},
): Promise<MergeResult> {
  const args = ['pull', '--progress', options.rebase ? '--rebase' : '--no-rebase']
  try {
    await runGit(args, remoteRunOptions(repoPath, options))
    return { status: 'done' }
  } catch (error) {
    if ((await getRepoOperation(repoPath)) !== null) return { status: 'conflicts' }
    throw error
  }
}

export interface PushOptions extends RemoteOptions {
  remote: string
  /** Local branch to push. */
  branch: string
  /** Branch name on the remote (default: same as local). */
  remoteBranch?: string
  /** Remember the remote branch as this branch's upstream (`-u`). */
  setUpstream?: boolean
  /**
   * Overwrite the remote branch even if it has commits we don't have, but
   * only if it hasn't changed since we last fetched (`--force-with-lease`).
   * This is the safe way to force-push.
   */
  force?: boolean
}

export async function push(repoPath: string, options: PushOptions): Promise<void> {
  const args = ['push', '--progress']
  if (options.setUpstream) args.push('--set-upstream')
  if (options.force) args.push('--force-with-lease')
  const target = options.remoteBranch ?? options.branch
  args.push(options.remote, `refs/heads/${options.branch}:refs/heads/${target}`)
  await runGit(args, remoteRunOptions(repoPath, options))
}

/** Delete a branch on a remote. */
export async function deleteRemoteBranch(
  repoPath: string,
  remote: string,
  branch: string,
  options: RemoteOptions = {},
): Promise<void> {
  await deleteRemoteBranches(repoPath, remote, [branch], options)
}

/** Delete several branches on one remote with a single push. */
export async function deleteRemoteBranches(
  repoPath: string,
  remote: string,
  branches: string[],
  options: RemoteOptions = {},
): Promise<void> {
  if (branches.length === 0) return
  await runGit(
    ['push', '--progress', remote, '--delete', ...branches.map((b) => `refs/heads/${b}`)],
    remoteRunOptions(repoPath, options),
  )
}

/** Push one tag to a remote. */
export async function pushTag(
  repoPath: string,
  remote: string,
  tag: string,
  options: RemoteOptions = {},
): Promise<void> {
  await runGit(
    ['push', '--progress', remote, `refs/tags/${tag}`],
    remoteRunOptions(repoPath, options),
  )
}
