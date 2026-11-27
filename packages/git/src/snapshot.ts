/**
 * Snapshots of repository state, used for undo/redo (see oplog.ts).
 *
 * A snapshot records:
 *   - HEAD: which branch is checked out (or which commit, if detached)
 *   - local branches and tags: which commit each points at
 *   - the index (staging area), saved as a git tree object
 *   - optionally the working tree, saved as a tree object too
 *
 * Saving trees uses git's own object database, so a snapshot costs almost
 * nothing for files that haven't changed (git stores each file version once).
 *
 * To snapshot the working tree without disturbing the real index, we copy
 * the index to a temporary file, point GIT_INDEX_FILE at it, `git add -A`
 * everything (untracked files included, ignored files excluded), and write
 * that as a tree. Copying the real index first makes this fast: git only
 * re-reads files whose size or timestamp changed.
 *
 * NOT included: remote branches (undoing a fetch makes no sense), stashes
 * (they keep their own history), and ignored files.
 */
import { copyFile, mkdtemp, rm, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GitError, runGit } from './run-git'
import { gitDir, gitPath } from './git-paths'
import type { Snapshot, SnapshotHead } from './types'

/** Refs that undo restores: local branches and tags. */
const RESTORED_REFS = ['refs/heads', 'refs/tags']

/** Where git keeps the index file (can differ for worktrees). */
const indexPath = (repoPath: string) => gitPath(repoPath, 'index')

async function readHead(repoPath: string): Promise<SnapshotHead> {
  const branch = await runGit(['symbolic-ref', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1],
  })
  const commit = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  if (branch.exitCode === 0) {
    return { kind: 'branch', ref: branch.stdout.trim(), unborn: commit.exitCode !== 0 }
  }
  return { kind: 'detached', sha: commit.stdout.trim() }
}

async function readRefs(repoPath: string): Promise<Record<string, string>> {
  const { stdout } = await runGit(
    ['for-each-ref', '--format=%(refname) %(objectname)', ...RESTORED_REFS],
    {
      cwd: repoPath,
    },
  )
  const refs: Record<string, string> = {}
  for (const line of stdout.split('\n')) {
    const space = line.lastIndexOf(' ')
    if (space > 0) refs[line.slice(0, space)] = line.slice(space + 1)
  }
  return refs
}

/** Save the index as a tree. Returns null if it can't be (e.g. unresolved conflicts). */
async function writeIndexTree(repoPath: string): Promise<string | null> {
  const result = await runGit(['write-tree'], { cwd: repoPath, okExitCodes: [0, 128] })
  return result.exitCode === 0 ? result.stdout.trim() : null
}

/** Save every non-ignored file in the working tree as a tree, without touching the real index. */
async function writeWorktreeTree(repoPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'trellis-snapshot-'))
  const tempIndex = join(dir, 'index')
  try {
    const realIndex = await indexPath(repoPath)
    if (existsSync(realIndex)) await copyFile(realIndex, tempIndex)
    const env = { GIT_INDEX_FILE: tempIndex }
    // If the copied index has conflict entries, start from an empty index instead.
    const unmerged = await runGit(['ls-files', '--unmerged'], { cwd: repoPath, env })
    if (unmerged.stdout.trim()) await unlink(tempIndex)
    await runGit(['add', '-A', '--', '.'], { cwd: repoPath, env })
    const { stdout } = await runGit(['write-tree'], { cwd: repoPath, env })
    return stdout.trim()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Record the current state. Include the working tree if the next operation may change files. */
export async function createSnapshot(
  repoPath: string,
  options: { worktree: boolean },
): Promise<Snapshot> {
  const [head, refs, indexTree, worktreeTree] = await Promise.all([
    readHead(repoPath),
    readRefs(repoPath),
    writeIndexTree(repoPath),
    options.worktree ? writeWorktreeTree(repoPath) : Promise.resolve(null),
  ])
  return { time: Date.now(), head, refs, indexTree, worktreeTree }
}

/** Stop a merge/rebase/cherry-pick/revert in progress, so state can be restored cleanly. */
async function abortInProgress(repoPath: string): Promise<void> {
  const dir = await gitDir(repoPath)
  const has = (name: string) => existsSync(join(dir, name))
  if (has('rebase-merge') || has('rebase-apply'))
    await runGit(['rebase', '--abort'], { cwd: repoPath })
  else if (has('MERGE_HEAD')) await runGit(['merge', '--abort'], { cwd: repoPath })
  else if (has('CHERRY_PICK_HEAD')) await runGit(['cherry-pick', '--abort'], { cwd: repoPath })
  else if (has('REVERT_HEAD')) await runGit(['revert', '--abort'], { cwd: repoPath })
}

/**
 * Put the repository back into the state recorded in `target`.
 *
 * `current` must be a snapshot of the state right now, taken with the
 * working tree if `target` has one. It's used to work out which files were
 * added since `target` (and so must be deleted), and lets the caller redo.
 *
 * Order matters: refs and HEAD first, then the working tree (written from a
 * temporary index so the real one isn't disturbed), then the real index.
 */
export async function restoreSnapshot(
  repoPath: string,
  target: Snapshot,
  current: Snapshot,
): Promise<void> {
  await abortInProgress(repoPath)

  // 1. Branches and tags: update changed ones, recreate deleted ones, delete new ones.
  const commands: string[] = []
  for (const [ref, sha] of Object.entries(target.refs)) {
    if (current.refs[ref] !== sha) commands.push(`update ${ref} ${sha}`)
  }
  for (const ref of Object.keys(current.refs)) {
    if (!(ref in target.refs)) commands.push(`delete ${ref}`)
  }
  if (commands.length) {
    await runGit(['update-ref', '--stdin'], { cwd: repoPath, stdin: commands.join('\n') + '\n' })
  }

  // 2. HEAD.
  if (target.head.kind === 'branch') {
    await runGit(['symbolic-ref', 'HEAD', target.head.ref], { cwd: repoPath })
  } else {
    await runGit(['update-ref', '--no-deref', 'HEAD', target.head.sha], { cwd: repoPath })
  }

  // 3. Working tree.
  if (target.worktreeTree) {
    if (!current.worktreeTree) {
      throw new GitError('Cannot restore files without a snapshot of the current files', [
        'restore',
      ])
    }
    // Files that exist now but didn't in the target: delete them.
    const added = await runGit(
      [
        'diff-tree',
        '-r',
        '-z',
        '--name-only',
        '--no-renames',
        '--diff-filter=A',
        target.worktreeTree,
        current.worktreeTree,
      ],
      { cwd: repoPath },
    )
    for (const path of added.stdout.split('\0').filter(Boolean)) {
      await rm(join(repoPath, path), { force: true })
      await removeEmptyParents(repoPath, path)
    }
    // Write every file from the target tree, via a temporary index.
    const dir = await mkdtemp(join(tmpdir(), 'trellis-restore-'))
    try {
      const env = { GIT_INDEX_FILE: join(dir, 'index') }
      await runGit(['read-tree', target.worktreeTree], { cwd: repoPath, env })
      await runGit(['checkout-index', '-a', '-f'], { cwd: repoPath, env })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  // 4. Index. An unborn branch with no snapshot index means "empty index".
  if (target.indexTree) await runGit(['read-tree', target.indexTree], { cwd: repoPath })
  else await runGit(['read-tree', '--empty'], { cwd: repoPath })
  // Refresh cached file timestamps so `git status` doesn't report false changes.
  await runGit(['update-index', '-q', '--refresh'], { cwd: repoPath, okExitCodes: [0, 1] })
}

/** After deleting `file`, remove folders it leaves empty (up to the repo root). */
async function removeEmptyParents(repoPath: string, file: string): Promise<void> {
  const { rmdir } = await import('node:fs/promises')
  const parts = file.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    try {
      await rmdir(join(repoPath, ...parts.slice(0, i))) // fails if not empty, which stops us
    } catch {
      return
    }
  }
}
