/**
 * Reading commit history with `git log`.
 *
 * We ask git for a custom format where each field is separated by the ASCII
 * "unit separator" character (\x1f) and each commit is terminated by NUL
 * (`-z`). Neither character can appear in commit messages, so splitting on
 * them is always safe, unlike newlines or spaces.
 */
import { runGit } from './run-git'
import type { Commit } from './types'

const FIELD = '\x1f'

/**
 * The git format placeholders for each field of `Commit`, in order.
 * See https://git-scm.com/docs/git-log#_pretty_formats
 */
const FORMAT = [
  '%H', // sha
  '%P', // parent shas, space separated
  '%an', // author name
  '%ae', // author email
  '%at', // author date (unix seconds)
  '%cn', // committer name
  '%ce', // committer email
  '%ct', // commit date (unix seconds)
  '%s', // subject
  '%b', // body
].join('%x1f')

/** The git arguments needed to produce output that `parseCommits` understands. */
export const LOG_FORMAT_ARGS = ['-z', `--format=${FORMAT}`]

/** Parse `git log -z --format=<FORMAT>` output into commits. */
export function parseCommits(output: string): Commit[] {
  const commits: Commit[] = []
  for (const record of output.split('\0')) {
    if (record === '') continue
    const f = record.split(FIELD)
    commits.push({
      sha: f[0]!,
      parents: f[1] ? f[1].split(' ') : [],
      authorName: f[2]!,
      authorEmail: f[3]!,
      authorDate: Number(f[4]) * 1000,
      committerName: f[5]!,
      committerEmail: f[6]!,
      commitDate: Number(f[7]) * 1000,
      subject: f[8]!,
      body: (f[9] ?? '').trim(),
    })
  }
  return commits
}

/**
 * Which commits to include in the history:
 * - 'all':   every local branch, remote branch and tag, plus HEAD (default)
 * - 'local': local branches and tags plus HEAD, without remote branches
 * - 'head':  only commits reachable from HEAD (the current branch)
 */
export type LogScope = 'all' | 'local' | 'head'

const SCOPE_REVISIONS: Record<LogScope, string[]> = {
  all: ['--branches', '--remotes', '--tags', 'HEAD'],
  local: ['--branches', '--tags', 'HEAD'],
  head: ['HEAD'],
}

/**
 * The revision arguments for `git log` for a scope, or null if there is
 * nothing to show (a repository with no commits yet).
 *
 * `git log HEAD` fails when HEAD has no commits, so HEAD is only included
 * when it points at a commit.
 */
export async function logRevisions(repoPath: string, scope: LogScope): Promise<string[] | null> {
  const head = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  if (head.exitCode === 0) return SCOPE_REVISIONS[scope]
  if (scope === 'head') return null
  // No HEAD commit: other refs may still exist (e.g. after `git checkout --orphan`).
  const refs = await runGit(['for-each-ref', '--count=1', '--format=%(refname)'], { cwd: repoPath })
  return refs.stdout.trim() ? SCOPE_REVISIONS[scope].filter((r) => r !== 'HEAD') : null
}

/**
 * Arguments for `git log` that list commits newest first in topological
 * order (a parent never appears before its children), which the commit
 * graph needs.
 */
export function logArgs(revisions: string[], extra: string[] = []): string[] {
  return ['log', ...LOG_FORMAT_ARGS, '--topo-order', ...extra, ...revisions, '--']
}

export interface LogOptions {
  /** Maximum commits to return. Default 500. */
  limit?: number
  /** Skip this many commits first. */
  skip?: number
  scope?: LogScope
}

/**
 * Load a slice of commit history in one go. Fine for small requests; the app
 * uses `LogReader` instead, which streams and stays fast deep into history.
 * Returns an empty list for a repository with no commits yet.
 */
export async function getLog(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const { limit = 500, skip = 0, scope = 'all' } = options
  const revisions = await logRevisions(repoPath, scope)
  if (!revisions) return []
  const { stdout } = await runGit(logArgs(revisions, [`--max-count=${limit}`, `--skip=${skip}`]), {
    cwd: repoPath,
  })
  return parseCommits(stdout)
}

/**
 * Find commits matching `query` by message, author or hash, newest first.
 * Matching ignores case, and the query is treated as plain text (not a
 * regular expression). Returns at most `limit` commit hashes.
 */
export async function searchCommits(
  repoPath: string,
  query: string,
  options: { scope?: LogScope; limit?: number } = {},
): Promise<string[]> {
  const text = query.trim()
  if (!text) return []
  const { scope = 'all', limit = 1000 } = options
  const revisions = await logRevisions(repoPath, scope)
  if (!revisions) return []

  const search = (filter: string) =>
    runGit(
      [
        'log',
        '--format=%H',
        '--topo-order',
        '--regexp-ignore-case',
        '--fixed-strings',
        filter,
        `--max-count=${limit}`,
        ...revisions,
        '--',
      ],
      { cwd: repoPath },
    ).then((r) => r.stdout.split('\n').filter(Boolean))

  // --grep and --author together would require BOTH to match, so run them
  // separately and combine the results.
  const [byMessage, byAuthor] = await Promise.all([
    search(`--grep=${text}`),
    search(`--author=${text}`),
  ])

  // A query that looks like a commit hash (prefix) may match one directly.
  let bySha: string[] = []
  if (/^[0-9a-f]{4,40}$/i.test(text)) {
    const sha = await runGit(['rev-parse', '--verify', '-q', `${text}^{commit}`], {
      cwd: repoPath,
      okExitCodes: [0, 1, 128],
    })
    if (sha.exitCode === 0) bySha = [sha.stdout.trim()]
  }

  // Keep git's newest-first order, without duplicates.
  return [...new Set([...bySha, ...byMessage, ...byAuthor])].slice(0, limit)
}
