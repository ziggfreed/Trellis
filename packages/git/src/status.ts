/**
 * Working tree status: which files are staged, modified, untracked or in
 * conflict, plus branch/upstream information.
 *
 * We use `git status --porcelain=v2 --branch -z`, a stable machine-readable
 * format designed for tools like us. Docs:
 * https://git-scm.com/docs/git-status#_porcelain_format_version_2
 */
import { runGit } from './run-git'
import { getRepoOperation } from './repo-state'
import type { BranchStatus, ChangeKind, RepoStatus, StatusSummary } from './types'

/**
 * Status letters used by git in the "XY" field. X is the staged (index)
 * state and Y the unstaged (working tree) state; "." means unchanged.
 */
const STATUS_LETTERS: Record<string, ChangeKind | null> = {
  '.': null,
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
}

function letter(code: string | undefined): ChangeKind | null {
  const key = code ?? '.'
  // Use `in` rather than `??`: '.' deliberately maps to null ("unchanged").
  // Any letter we don't recognise is treated as a modification.
  return key in STATUS_LETTERS ? (STATUS_LETTERS[key] as ChangeKind | null) : 'modified'
}

/**
 * Parse porcelain v2 output (run with `-z`).
 *
 * With `-z`, every entry ends with a NUL byte instead of a newline, and paths
 * are never quoted. Rename entries ("2 ...") are followed by an extra
 * NUL-terminated field with the original path. Example (NULs shown as ␀):
 *
 *   # branch.oid 1a2b...␀# branch.head main␀1 .M N... 100644 100644 100644 a.. b.. src/app.ts␀
 *   2 R. N... 100644 100644 100644 a.. b.. R100 new.ts␀old.ts␀? notes.txt␀
 */
export function parseStatus(output: string): RepoStatus {
  const status: RepoStatus = {
    branch: { head: null, oid: null, upstream: null, ahead: 0, behind: 0 },
    files: [],
    operation: null,
  }
  const entries = output.split('\0')

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry === '') continue

    if (entry.startsWith('# ')) {
      parseBranchHeader(entry, status.branch)
      continue
    }

    const type = entry[0]
    if (type === '1') {
      // "1 XY sub mH mI mW hH hI path" (path may contain spaces, so limit splits)
      const fields = splitFields(entry, 9)
      const xy = fields[1]!
      status.files.push({ path: fields[8]!, staged: letter(xy[0]), unstaged: letter(xy[1]) })
    } else if (type === '2') {
      // "2 XY sub mH mI mW hH hI Xscore path", then the original path as the next entry.
      const fields = splitFields(entry, 10)
      const xy = fields[1]!
      const origPath = entries[++i]
      status.files.push({
        path: fields[9]!,
        origPath,
        staged: letter(xy[0]),
        unstaged: letter(xy[1]),
      })
    } else if (type === 'u') {
      // Unmerged (conflict): "u XY sub m1 m2 m3 mW h1 h2 h3 path"
      const fields = splitFields(entry, 11)
      status.files.push({ path: fields[10]!, staged: null, unstaged: 'conflicted' })
    } else if (type === '?') {
      status.files.push({ path: entry.slice(2), staged: null, unstaged: 'untracked' })
    }
    // '!' (ignored files) is not requested, so we never see it.
  }
  return status
}

/** Read one "# branch.*" header line into `branch`. */
function parseBranchHeader(entry: string, branch: BranchStatus): void {
  const [key, ...rest] = entry.slice(2).split(' ')
  const value = rest.join(' ')
  if (key === 'branch.oid') branch.oid = value === '(initial)' ? null : value
  else if (key === 'branch.head') branch.head = value === '(detached)' ? null : value
  else if (key === 'branch.upstream') branch.upstream = value
  else if (key === 'branch.ab') {
    // Format: "+<ahead> -<behind>"
    const match = /^\+(\d+) -(\d+)$/.exec(value)
    if (match) {
      branch.ahead = Number(match[1])
      branch.behind = Number(match[2])
    }
  }
}

/**
 * Like parseStatus, but only counts the changed files instead of building
 * an object for each. Used for the home screen's list of repositories,
 * where a repository with thousands of untracked files would otherwise
 * mean thousands of objects parsed and sent to the UI just to show a number.
 */
export function parseStatusSummary(output: string): StatusSummary {
  const summary: StatusSummary = {
    branch: { head: null, oid: null, upstream: null, ahead: 0, behind: 0 },
    changes: 0,
  }
  const entries = output.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.startsWith('# ')) parseBranchHeader(entry, summary.branch)
    else if (entry.startsWith('1 ') || entry.startsWith('u ') || entry.startsWith('? '))
      summary.changes++
    else if (entry.startsWith('2 ')) {
      // A rename or copy: the next entry is its original path, not a file of its own.
      summary.changes++
      i++
    }
  }
  return summary
}

/**
 * Split `text` on spaces into at most `count` fields; the last field keeps
 * any remaining spaces (file paths can contain spaces).
 */
function splitFields(text: string, count: number): string[] {
  const fields: string[] = []
  let rest = text
  for (let i = 0; i < count - 1; i++) {
    const space = rest.indexOf(' ')
    if (space === -1) break
    fields.push(rest.slice(0, space))
    rest = rest.slice(space + 1)
  }
  fields.push(rest)
  return fields
}

/** Get the status of the working tree and current branch. */
export async function getStatus(repoPath: string): Promise<RepoStatus> {
  const { stdout } = await runGit(
    ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'],
    { cwd: repoPath },
  )
  const status = parseStatus(stdout)
  status.operation = await getRepoOperation(repoPath)
  return status
}

/**
 * The branch and number of changed files (see parseStatusSummary). Uses
 * --no-optional-locks so this background check never takes git's index
 * lock, which could make a command in another tool fail at the same moment.
 */
export async function getStatusSummary(repoPath: string): Promise<StatusSummary> {
  const { stdout } = await runGit(
    ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'],
    { cwd: repoPath },
  )
  return parseStatusSummary(stdout)
}
