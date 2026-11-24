/**
 * Staging: moving changes between the working tree and the index.
 *
 *   stageFiles    working tree -> index    (git add)
 *   unstageFiles  index -> back to HEAD    (git restore --staged)
 *   discardFiles  throw away working-tree changes (git restore / git clean)
 *   getFilePatch  the diff of one file, for hunk and line staging
 *   applyPatch    stage, unstage or discard part of a file
 *
 * Paths are passed with GIT_LITERAL_PATHSPECS=1 so names containing
 * characters like * or ? are taken literally, not as patterns.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runGit } from './run-git'
import { parsePatch, type FilePatch } from './patch'

const LITERAL = { GIT_LITERAL_PATHSPECS: '1' }

/**
 * Run a git command once per batch of paths. Very long command lines fail
 * (Windows allows ~32,000 characters), so we never pass thousands of paths
 * in one go.
 */
async function forPathBatches(paths: string[], run: (batch: string[]) => Promise<unknown>) {
  const BATCH = 100
  for (let i = 0; i < paths.length; i += BATCH) await run(paths.slice(i, i + BATCH))
}

async function hasHeadCommit(repoPath: string): Promise<boolean> {
  const head = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  return head.exitCode === 0
}

/** Stage files (including new and deleted ones). */
export async function stageFiles(repoPath: string, paths: string[]): Promise<void> {
  // -A also stages deletions of the given paths.
  await forPathBatches(paths, (batch) =>
    runGit(['add', '-A', '--', ...batch], { cwd: repoPath, env: LITERAL }),
  )
}

/** Unstage files, keeping their changes in the working tree. */
export async function unstageFiles(repoPath: string, paths: string[]): Promise<void> {
  // Before the first commit there's no HEAD to restore from, so remove the
  // files from the index instead (they become untracked again).
  const command = (await hasHeadCommit(repoPath))
    ? ['restore', '--staged', '--']
    : ['rm', '--cached', '-r', '-q', '--']
  await forPathBatches(paths, (batch) =>
    runGit([...command, ...batch], { cwd: repoPath, env: LITERAL }),
  )
}

/**
 * Throw away working-tree changes. Tracked files go back to their staged
 * (or committed) version; untracked files are DELETED. This can't be undone.
 */
export async function discardFiles(
  repoPath: string,
  files: { path: string; untracked: boolean }[],
): Promise<void> {
  const tracked = files.filter((f) => !f.untracked).map((f) => f.path)
  const untracked = files.filter((f) => f.untracked).map((f) => f.path)
  await forPathBatches(tracked, (batch) =>
    runGit(['restore', '--worktree', '--', ...batch], { cwd: repoPath, env: LITERAL }),
  )
  await forPathBatches(untracked, (batch) =>
    runGit(['clean', '-f', '-q', '--', ...batch], { cwd: repoPath, env: LITERAL }),
  )
}

/**
 * The diff of one file as a parsed patch, or null if it has no changes.
 * - `staged`: HEAD -> index (what will be committed)
 * - `unstaged`: index -> working tree
 * - `untracked`: an untracked file, shown as entirely new
 */
export async function getFilePatch(
  repoPath: string,
  path: string,
  area: 'staged' | 'unstaged' | 'untracked',
): Promise<FilePatch | null> {
  const base = ['diff', '--no-ext-diff', '--no-color', '--unified=3']
  let args: string[]
  if (area === 'untracked') {
    // Compare against an empty file. Git treats /dev/null specially on every
    // platform, including Windows. --no-index exits 1 when there are differences.
    args = [...base, '--no-index', '--', '/dev/null', path]
  } else {
    args = [...base, ...(area === 'staged' ? ['--cached'] : []), '--', path]
  }
  const { stdout } = await runGit(args, { cwd: repoPath, env: LITERAL, okExitCodes: [0, 1] })
  return parsePatch(stdout)
}

/**
 * Apply a patch made by `buildPartialPatch`:
 * - 'stage':   to the index                  (git apply --cached)
 * - 'unstage': reversed, to the index         (git apply --cached --reverse)
 * - 'discard': reversed, to the working tree  (git apply --reverse)
 */
export async function applyPatch(
  repoPath: string,
  patch: string,
  action: 'stage' | 'unstage' | 'discard',
): Promise<void> {
  const args = ['apply', '--whitespace=nowarn']
  if (action !== 'discard') args.push('--cached')
  if (action !== 'stage') args.push('--reverse')
  await runGit([...args, '-'], { cwd: repoPath, stdin: patch })
}

/**
 * Save the resolved contents of a conflicted file and stage it, which tells
 * git the conflict is resolved.
 */
export async function saveResolvedFile(
  repoPath: string,
  path: string,
  content: string,
): Promise<void> {
  await writeFile(join(repoPath, path), content)
  await runGit(['add', '--', path], { cwd: repoPath, env: LITERAL })
}

/**
 * Resolve a conflicted file in one go:
 * - 'current':  keep our version of the whole file
 * - 'incoming': take their version of the whole file
 * - 'delete':   delete the file
 * If the chosen side deleted the file, the file is deleted.
 */
export async function resolveFileWith(
  repoPath: string,
  path: string,
  choice: 'current' | 'incoming' | 'delete',
): Promise<void> {
  if (choice !== 'delete') {
    const side = choice === 'current' ? '--ours' : '--theirs'
    const result = await runGit(['checkout', side, '--', path], {
      cwd: repoPath,
      env: LITERAL,
      okExitCodes: [0, 1],
    })
    // Exit 1 means that side has no version of the file (it was deleted there).
    if (result.exitCode === 0) {
      await runGit(['add', '--', path], { cwd: repoPath, env: LITERAL })
      return
    }
  }
  await runGit(['rm', '-q', '--', path], { cwd: repoPath, env: LITERAL })
}
