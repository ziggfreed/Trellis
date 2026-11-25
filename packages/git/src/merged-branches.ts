/**
 * Finding local branches that are already merged, so they can be deleted
 * in one go ("clean up branches").
 *
 * "Merged into X" means every commit on the branch is also on X, so
 * deleting it loses nothing: git's own `git branch -d` accepts it.
 *
 * Hosting sites often merge differently, though: "squash and merge" makes one
 * new commit, and "rebase and merge" copies each commit. The branch's commits
 * then never appear on X, so git calls it unmerged even though its changes
 * are all there. getBranchCleanup detects those too, by comparing *patches*
 * (what each commit changes) instead of commit hashes.
 */
import { runGit } from './run-git'
import type { BranchMergeState, CleanupBranch, RemoteCleanupBranch } from './types'

/** Branch names never offered for deletion, whatever they're merged into. */
export const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'development', 'dev', 'trunk']

/**
 * How far back along the target to look for a squash commit. Checking means
 * diffing every target commit since the branch started, which is slow for a
 * branch started years ago; such old branches are reported as unmerged.
 */
const SQUASH_SEARCH_LIMIT = 2000

/** How many branches to check at once (each check runs a few git commands). */
const CONCURRENCY = 4

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

/**
 * Parse `git for-each-ref` output in the format used below:
 * name, HEAD marker, worktree path, upstream, upstream track, NUL-separated.
 */
export function parseBranchList(output: string) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name = '', head = '', worktree = '', upstream = '', track = ''] = line.split('\0')
      return {
        name,
        current: head === '*',
        inWorktree: worktree !== '',
        upstream: upstream || null,
        upstreamGone: track === 'gone',
      }
    })
}

/** Local branches that may be offered for deletion: see getMergedBranches. */
async function deletableBranches(repoPath: string, target: string, mergedOnly: boolean) {
  const { stdout } = await runGit(
    [
      'for-each-ref',
      '--format=%(refname:short)%00%(HEAD)%00%(worktreepath)%00%(upstream:short)%00%(upstream:track,nobracket)',
      ...(mergedOnly ? [`--merged=${target}`] : []),
      'refs/heads',
    ],
    { cwd: repoPath },
  )
  return parseBranchList(stdout).filter(
    (b) => b.name !== target && !b.current && !b.inWorktree && !PROTECTED_BRANCHES.includes(b.name),
  )
}

/**
 * Local branches fully merged into `target` that are safe to delete: not
 * `target` itself, not checked out (here or in another worktree), and not a
 * long-lived branch like main or develop.
 */
export async function getMergedBranches(repoPath: string, target: string): Promise<string[]> {
  const branches = await deletableBranches(repoPath, target, true)
  return branches.map((b) => b.name).sort((a, b) => a.localeCompare(b))
}

/**
 * Every local branch that could be deleted (the same exclusions as
 * getMergedBranches), with whether it's merged into `target` (normally,
 * or by squash/rebase) and whether its remote branch still exists. The UI
 * decides which to suggest; see features/repo-tools/branch-cleanup.ts.
 */
export async function getBranchCleanup(repoPath: string, target: string): Promise<CleanupBranch[]> {
  const [all, merged] = await Promise.all([
    deletableBranches(repoPath, target, false),
    getMergedBranches(repoPath, target),
  ])
  const mergedSet = new Set(merged)
  const results = await mapLimit(all, CONCURRENCY, async (branch): Promise<CleanupBranch> => {
    const base = { name: branch.name, upstream: branch.upstream, upstreamGone: branch.upstreamGone }
    if (mergedSet.has(branch.name)) return { ...base, merged: 'merged', aheadOfTarget: 0 }
    const ahead = await countCommits(repoPath, `${target}..${branch.name}`)
    return {
      ...base,
      merged: await squashMergeState(repoPath, target, branch.name),
      aheadOfTarget: ahead,
    }
  })
  return results.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * At most this many unmerged remote branches are checked for squash merges
 * (the most recently updated first). Busy shared repositories can have
 * thousands of remote branches, and each check runs several git commands.
 */
const REMOTE_SQUASH_CHECK_LIMIT = 200

/**
 * Remote branches whose work is already on `target` (merged normally, or
 * by squash/rebase), so they can be deleted from the server. Never offered:
 * a remote's HEAD pointer, branches with a protected name (main, develop...),
 * the target's own upstream, and the upstreams of branches checked out
 * here or in another worktree.
 */
export async function getRemoteBranchCleanup(
  repoPath: string,
  target: string,
): Promise<RemoteCleanupBranch[]> {
  const [remotes, merged, inUse] = await Promise.all([
    runGit(['remote'], { cwd: repoPath }),
    runGit(['for-each-ref', '--format=%(refname:short)', `--merged=${target}`, 'refs/remotes'], {
      cwd: repoPath,
    }),
    // Upstreams of the target and of checked-out branches: deleting those
    // would pull the rug out from under work in progress.
    runGit(
      [
        'for-each-ref',
        '--format=%(refname:short)%00%(HEAD)%00%(worktreepath)%00%(upstream:short)',
        'refs/heads',
      ],
      { cwd: repoPath },
    ),
  ])
  const remoteNames = remotes.stdout.split('\n').filter(Boolean)
  const keep = new Set(
    inUse.stdout
      .split('\n')
      .map((line) => line.split('\0'))
      .filter(([name, head, worktree]) => name === target || head === '*' || worktree)
      .map(([, , , upstream]) => upstream)
      .filter(Boolean),
  )
  const describe = (name: string) => {
    // Remote names may contain "/" too, so match the longest known remote.
    const remote = remoteNames
      .filter((r) => name.startsWith(`${r}/`))
      .sort((a, b) => b.length - a.length)[0]
    if (!remote) return null
    const branch = name.slice(remote.length + 1)
    if (branch === 'HEAD' || PROTECTED_BRANCHES.includes(branch) || keep.has(name)) return null
    return { name, remote, branch }
  }
  // origin/HEAD's short name is just "origin", which describe() skips.
  const parse = (out: string) =>
    out
      .split('\n')
      .filter(Boolean)
      .map(describe)
      .filter((b): b is NonNullable<typeof b> => b !== null)

  const mergedBranches = parse(merged.stdout)
  const mergedNames = new Set(mergedBranches.map((b) => b.name))
  const all = await runGit(
    ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes'],
    { cwd: repoPath },
  )
  const others = parse(all.stdout)
    .filter((b) => !mergedNames.has(b.name))
    .slice(0, REMOTE_SQUASH_CHECK_LIMIT)
  const squashed = await mapLimit(others, CONCURRENCY, async (b) =>
    (await squashMergeState(repoPath, target, b.name)) === 'squashed' ? b : null,
  )
  return [
    ...mergedBranches.map((b) => ({ ...b, merged: 'merged' as const })),
    ...squashed.filter((b) => b !== null).map((b) => ({ ...b, merged: 'squashed' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Whether the changes of a branch that git calls unmerged are on `target`
 * anyway, as different commits.
 */
async function squashMergeState(
  repoPath: string,
  target: string,
  branch: string,
): Promise<BranchMergeState> {
  // "Rebase and merge": each of the branch's commits was copied onto the
  // target. `git cherry` marks a commit "-" when the target has a commit with
  // the same patch, so if every line starts with "-", nothing is missing.
  const cherry = await runGit(['cherry', target, branch], { cwd: repoPath })
  const lines = cherry.stdout.split('\n').filter(Boolean)
  if (lines.length > 0 && lines.every((line) => line.startsWith('-'))) return 'squashed'

  // "Squash and merge": the target has one commit whose patch is the whole
  // branch's diff (from where it started to its tip). Compare patch IDs, a
  // hash of a diff that ignores line numbers and whitespace.
  const mergeBase = await runGit(['merge-base', target, branch], {
    cwd: repoPath,
    okExitCodes: [0, 1],
  })
  const base = mergeBase.stdout.trim()
  if (!base) return 'unmerged' // unrelated histories
  const branchDiff = await runGit(['diff', '--no-color', '--no-ext-diff', base, branch], {
    cwd: repoPath,
  })
  if (!branchDiff.stdout) return 'unmerged' // the branch changes nothing overall
  const [branchId] = await patchIds(repoPath, branchDiff.stdout)
  if (!branchId) return 'unmerged'
  const targetLog = await runGit(
    [
      'log',
      '-p',
      '--no-color',
      '--no-ext-diff',
      '--no-merges',
      `--max-count=${SQUASH_SEARCH_LIMIT}`,
      `${base}..${target}`,
    ],
    { cwd: repoPath },
  )
  const targetIds = await patchIds(repoPath, targetLog.stdout)
  return targetIds.includes(branchId) ? 'squashed' : 'unmerged'
}

/** Patch IDs (`git patch-id --stable`) of the diffs in `patchText`, in order. */
async function patchIds(repoPath: string, patchText: string): Promise<string[]> {
  if (!patchText) return []
  const { stdout } = await runGit(['patch-id', '--stable'], { cwd: repoPath, stdin: patchText })
  // Each line is "<patch id> <commit id>"; we only need the patch ID.
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(' ')[0]!)
}

async function countCommits(repoPath: string, range: string): Promise<number> {
  const { stdout } = await runGit(['rev-list', '--count', range], { cwd: repoPath })
  return Number(stdout.trim()) || 0
}

/** Like Promise.all(items.map(fn)), but with at most `limit` running at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
