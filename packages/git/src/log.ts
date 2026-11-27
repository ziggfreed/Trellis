/**
 * Reading commit history with `git log`.
 *
 * We ask git for a custom format where each field is separated by the ASCII
 * "unit separator" character (\x1f) and each commit is terminated by NUL
 * (`-z`). Neither character can appear in commit messages, so splitting on
 * them is always safe, unlike newlines or spaces.
 */
import { runGit } from './run-git'
import type { Commit, CommitFilter, LogOrder, LogScope } from './types'

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

/** The `git log` option for an order (see LogOrder). */
export const orderArg = (order: LogOrder) => (order === 'date' ? '--date-order' : '--topo-order')

/**
 * Arguments for `git log` that list commits newest first with a parent
 * never before its children (which the commit graph needs), either keeping
 * each line of work together (the default) or mixed by date.
 */
export function logArgs(
  revisions: string[],
  extra: string[] = [],
  order: LogOrder = 'topo',
): string[] {
  return ['log', ...LOG_FORMAT_ARGS, orderArg(order), ...extra, ...revisions, '--']
}

export interface LogOptions {
  /** Maximum commits to return. Default 500. */
  limit?: number
  /** Skip this many commits first. */
  skip?: number
  scope?: LogScope
  /** Default "topo". */
  order?: LogOrder
}

/**
 * Load a slice of commit history in one go. Fine for small requests; the app
 * uses `LogReader` instead, which streams and stays fast deep into history.
 * Returns an empty list for a repository with no commits yet.
 */
export async function getLog(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const { limit = 500, skip = 0, scope = 'all', order = 'topo' } = options
  const revisions = await logRevisions(repoPath, scope)
  if (!revisions) return []
  const extra = [`--max-count=${limit}`, `--skip=${skip}`]
  const { stdout } = await runGit(logArgs(revisions, extra, order), {
    cwd: repoPath,
  })
  return parseCommits(stdout)
}

/** True if the filter has nothing set (so there's nothing to search for). */
export function isEmptyFilter(filter: CommitFilter): boolean {
  return !Object.values(filter).some((value) => typeof value === 'string' && value.trim() !== '')
}

/**
 * Find commits matching `filter`, newest first. Text matching ignores case
 * and treats the text literally (not as a regular expression). Returns at
 * most `limit` commit hashes.
 */
export async function findCommits(
  repoPath: string,
  filter: CommitFilter,
  options: { scope?: LogScope; limit?: number; order?: LogOrder } = {},
): Promise<string[]> {
  if (isEmptyFilter(filter)) return []
  const { scope = 'all', limit = 1000, order = 'topo' } = options
  const revisions = await logRevisions(repoPath, scope)
  if (!revisions) return []

  const text = filter.text?.trim() ?? ''
  const author = filter.author?.trim() ?? ''
  const path = filter.path?.trim() ?? ''
  const content = filter.content?.trim() ?? ''

  // Options shared by every search below; git ANDs these together.
  const common = [
    ...(author ? [`--author=${author}`] : []),
    ...(filter.since ? [`--since=${filter.since} 00:00:00`] : []),
    ...(filter.until ? [`--until=${filter.until} 23:59:59`] : []),
    ...(content ? [`-S${content}`] : []),
  ]
  const search = (extra: string[]) =>
    runGit(
      [
        'log',
        '--format=%H',
        // Same order as the history list, so jumping between results goes down it.
        orderArg(order),
        '--regexp-ignore-case',
        '--fixed-strings',
        ...common,
        ...extra,
        `--max-count=${limit}`,
        ...revisions,
        '--',
        ...(path ? [path] : []),
      ],
      { cwd: repoPath },
    ).then((r) => r.stdout.split('\n').filter(Boolean))

  if (!text) return search([])

  // Free text matches the message OR the author. Several --grep/--author
  // options in one git command don't combine that way, so run a search for
  // each and merge the results. (A second --author would be ORed with the
  // author filter, so skip the author search when one is set.)
  const [byMessage, byAuthor] = await Promise.all([
    search([`--grep=${text}`]),
    author ? Promise.resolve([]) : search([`--author=${text}`]),
  ])

  // Text that looks like a commit hash (or the start of one) may name a commit
  // directly. Only used when nothing else narrows the search.
  let bySha: string[] = []
  const onlyText = common.length === 0 && !path
  if (onlyText && /^[0-9a-f]{4,40}$/i.test(text)) {
    const sha = await runGit(['rev-parse', '--verify', '-q', `${text}^{commit}`], {
      cwd: repoPath,
      okExitCodes: [0, 1, 128],
    })
    if (sha.exitCode === 0) bySha = [sha.stdout.trim()]
  }

  // Keep git's newest-first order, without duplicates. (Merging separate
  // searches can put results slightly out of order; that's fine for jumping
  // between matches.)
  return [...new Set([...bySha, ...byMessage, ...byAuthor])].slice(0, limit)
}

/**
 * Find commits matching `query` by message, author or hash, newest first.
 * Shorthand for findCommits with just `text`.
 */
export async function searchCommits(
  repoPath: string,
  query: string,
  options: { scope?: LogScope; limit?: number } = {},
): Promise<string[]> {
  return findCommits(repoPath, { text: query }, options)
}
