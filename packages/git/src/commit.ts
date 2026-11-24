/**
 * Details of a single commit: its metadata and the list of files it changed.
 */
import { GitError, runGit } from './run-git'
import { LOG_FORMAT_ARGS, parseCommits } from './log'
import type { ChangeKind, ChangedFile, CommitDetails } from './types'

/** Letters used by `--name-status` (the first character of the status). */
const NAME_STATUS: Record<string, ChangeKind> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
  U: 'conflicted',
}

/**
 * Parse `--name-status -z` output. Records look like (␀ = NUL):
 *   M␀src/app.ts␀          one path
 *   R087␀old.ts␀new.ts␀    renames and copies have a similarity score and two paths
 */
export function parseNameStatus(output: string): Omit<ChangedFile, 'additions' | 'deletions'>[] {
  const tokens = output.split('\0')
  const files: Omit<ChangedFile, 'additions' | 'deletions'>[] = []
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i]!
    if (code === '') continue
    const change = NAME_STATUS[code[0]!] ?? 'modified'
    if (change === 'renamed' || change === 'copied') {
      const oldPath = tokens[++i]!
      files.push({ path: tokens[++i]!, oldPath, change })
    } else {
      files.push({ path: tokens[++i]!, change })
    }
  }
  return files
}

/**
 * Parse `--numstat -z` output into a map of path -> line counts.
 * Records look like "added<TAB>deleted<TAB>path␀". For renames the path part is
 * empty and the old and new paths follow as separate NUL-terminated fields.
 * Binary files show "-" instead of numbers.
 */
export function parseNumstat(
  output: string,
): Map<string, { additions: number | null; deletions: number | null }> {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>()
  const tokens = output.split('\0')
  for (let i = 0; i < tokens.length; i++) {
    const record = tokens[i]!
    if (record === '') continue
    const [added = '-', deleted = '-', path = ''] = record.split('\t')
    let finalPath = path
    if (path === '') {
      // Rename/copy: the next two fields are the old path and the new path.
      i += 2
      finalPath = tokens[i]!
    }
    stats.set(finalPath, {
      additions: added === '-' ? null : Number(added),
      deletions: deleted === '-' ? null : Number(deleted),
    })
  }
  return stats
}

/** Load a commit's metadata and changed files. */
export async function getCommitDetails(repoPath: string, sha: string): Promise<CommitDetails> {
  const log = await runGit(['log', '-1', ...LOG_FORMAT_ARGS, sha, '--'], { cwd: repoPath })
  const commit = parseCommits(log.stdout)[0]
  if (!commit) throw new GitError(`Commit not found: ${sha}`, ['log', sha])

  // Compare with the first parent; the very first commit is compared with an
  // empty tree (`--root`). -M detects renames.
  const firstParent = commit.parents[0]
  const range = firstParent ? [firstParent, sha] : ['--root', sha]
  const base = ['diff-tree', '-r', '-z', '-M', '--no-commit-id']

  const [nameStatus, numstat] = await Promise.all([
    runGit([...base, '--name-status', ...range], { cwd: repoPath }),
    runGit([...base, '--numstat', ...range], { cwd: repoPath }),
  ])
  const stats = parseNumstat(numstat.stdout)
  const files = parseNameStatus(nameStatus.stdout).map((file) => ({
    ...file,
    additions: stats.get(file.path)?.additions ?? null,
    deletions: stats.get(file.path)?.deletions ?? null,
  }))
  return { commit, files }
}
