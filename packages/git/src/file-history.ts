/**
 * Looking at one file over time, and comparing two points in history:
 *
 *   getFileHistory  commits that changed a file, following renames
 *   getBlame        who last changed each line, and in which commit
 *   getComparison   what one branch/commit has that another doesn't
 */
import { runGit } from './run-git'
import { LOG_FORMAT_ARGS, parseCommits } from './log'
import { parseNameStatus, parseNumstat } from './commit'
import type {
  BlameCommit,
  BlameLine,
  BlameResult,
  ChangedFile,
  Comparison,
  FileHistoryEntry,
} from './types'

const LITERAL = { GIT_LITERAL_PATHSPECS: '1' }
const RECORD = '\x1e'

// ---------------------------------------------------------------------------
// File history
// ---------------------------------------------------------------------------

/**
 * Parse `git log --follow --name-status -z --format=%x1e<LOG FORMAT>`.
 * Each record is: \x1e <commit fields> NUL "\n" <name-status entries, NUL separated>.
 * Merge commits may have no name-status entries; they keep the newer path.
 */
export function parseFileHistory(output: string, currentPath: string): FileHistoryEntry[] {
  const entries: FileHistoryEntry[] = []
  let path = currentPath
  for (const record of output.split(RECORD)) {
    if (record === '') continue
    const end = record.indexOf('\0')
    const [commit] = parseCommits(record.slice(0, end) + '\0')
    if (!commit) continue
    const [change] = parseNameStatus(record.slice(end + 1).replace(/^\n/, ''))
    if (change) path = change.path
    entries.push({
      commit,
      path,
      change: change?.change ?? 'modified',
      ...(change?.oldPath ? { oldPath: change.oldPath } : {}),
    })
    // Older commits know the file by its name before the rename.
    if (change?.oldPath) path = change.oldPath
  }
  return entries
}

/** Commits that changed `path`, newest first, following it through renames. */
export async function getFileHistory(
  repoPath: string,
  path: string,
  options: { limit?: number } = {},
): Promise<FileHistoryEntry[]> {
  const format = LOG_FORMAT_ARGS[1]!.replace('--format=', `--format=%x1e`)
  const { stdout } = await runGit(
    [
      'log',
      '--follow',
      '-M',
      '-z',
      format,
      '--name-status',
      `--max-count=${options.limit ?? 1000}`,
      '--',
      path,
    ],
    { cwd: repoPath, env: LITERAL },
  )
  return parseFileHistory(stdout, path)
}

// ---------------------------------------------------------------------------
// Blame
// ---------------------------------------------------------------------------

/** Hash git uses for lines that aren't committed yet. */
export const UNCOMMITTED_SHA = '0'.repeat(40)

const BLAME_HEADER = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/

/**
 * Parse `git blame --porcelain`. For each line git prints a header
 * "<sha> <original line> <final line> [<lines in group>]", then (the first
 * time a commit appears) details like "author ..." and "summary ...", then
 * the line's text prefixed with a TAB.
 */
export function parseBlame(output: string): BlameResult {
  const lines: BlameLine[] = []
  const commits: Record<string, BlameCommit> = {}
  let current: { sha: string; origLine: number; line: number } | null = null
  let details: Partial<BlameCommit> = {}

  for (const raw of output.split('\n')) {
    const header = BLAME_HEADER.exec(raw)
    if (header && !current) {
      current = { sha: header[1]!, origLine: Number(header[2]), line: Number(header[3]) }
      details = commits[current.sha] ? {} : { sha: current.sha }
      continue
    }
    if (!current) continue
    if (raw.startsWith('\t')) {
      if (details.sha) {
        commits[current.sha] = {
          sha: current.sha,
          author: details.author ?? '',
          authorEmail: details.authorEmail ?? '',
          authorTime: details.authorTime ?? 0,
          summary: details.summary ?? '',
          filename: details.filename ?? '',
          ...(details.previous ? { previous: details.previous } : {}),
        }
      }
      lines.push({ ...current, text: raw.slice(1) })
      current = null
      continue
    }
    const space = raw.indexOf(' ')
    const key = space === -1 ? raw : raw.slice(0, space)
    const value = space === -1 ? '' : raw.slice(space + 1)
    if (key === 'author') details.author = value
    else if (key === 'author-mail') details.authorEmail = value.replace(/^<|>$/g, '')
    else if (key === 'author-time') details.authorTime = Number(value) * 1000
    else if (key === 'summary') details.summary = value
    else if (key === 'filename') details.filename = value
    else if (key === 'previous') {
      const split = value.indexOf(' ')
      details.previous = { sha: value.slice(0, split), path: value.slice(split + 1) }
    }
  }
  return { lines, commits }
}

/**
 * Who last changed each line of `path`. Without `revision` the working-tree
 * version is used (uncommitted lines get UNCOMMITTED_SHA); with one, the
 * file as it was in that commit.
 */
export async function getBlame(
  repoPath: string,
  path: string,
  revision?: string,
): Promise<BlameResult> {
  const { stdout } = await runGit(
    ['blame', '--porcelain', ...(revision ? [revision] : []), '--', path],
    {
      cwd: repoPath,
      env: LITERAL,
    },
  )
  return parseBlame(stdout)
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

/**
 * Compare `head` with `base` the way a pull request would: the commits on
 * `head` that `base` doesn't have, and the file changes since the point
 * where they split (the merge base).
 */
export async function getComparison(
  repoPath: string,
  base: string,
  head: string,
): Promise<Comparison> {
  const mergeBase = await runGit(['merge-base', base, head], { cwd: repoPath, okExitCodes: [0, 1] })
  const baseSha = mergeBase.exitCode === 0 ? mergeBase.stdout.trim() : null

  const [log, counts] = await Promise.all([
    runGit(
      ['log', ...LOG_FORMAT_ARGS, '--topo-order', '--max-count=1000', `${base}..${head}`, '--'],
      { cwd: repoPath },
    ),
    runGit(['rev-list', '--left-right', '--count', `${base}...${head}`], { cwd: repoPath }),
  ])
  const [behind = 0] = counts.stdout.trim().split(/\s+/).map(Number)

  let files: ChangedFile[] = []
  if (baseSha) {
    const range = [baseSha, head]
    const base = ['diff', '-z', '-M', '--no-ext-diff']
    const [nameStatus, numstat] = await Promise.all([
      runGit([...base, '--name-status', ...range, '--'], { cwd: repoPath }),
      runGit([...base, '--numstat', ...range, '--'], { cwd: repoPath }),
    ])
    const stats = parseNumstat(numstat.stdout)
    files = parseNameStatus(nameStatus.stdout).map((f) => ({
      ...f,
      additions: stats.get(f.path)?.additions ?? null,
      deletions: stats.get(f.path)?.deletions ?? null,
    }))
  }
  return { mergeBase: baseSha, commits: parseCommits(log.stdout), behind, files }
}
