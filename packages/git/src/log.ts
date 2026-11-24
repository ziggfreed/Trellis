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

export interface LogOptions {
  /** Maximum commits to return. Default 500. */
  limit?: number
  /** Skip this many commits first (for loading more pages). */
  skip?: number
  /**
   * Which commits to include:
   * - 'all': every local branch, remote branch and tag, plus HEAD (default)
   * - 'head': only commits reachable from HEAD
   */
  scope?: 'all' | 'head'
}

/**
 * Load commit history, newest first, in topological order (a parent never
 * appears before its children), which the commit graph needs.
 *
 * Returns an empty list for a repository with no commits yet.
 */
export async function getLog(repoPath: string, options: LogOptions = {}): Promise<Commit[]> {
  const { limit = 500, skip = 0, scope = 'all' } = options
  const revisions = scope === 'all' ? ['--branches', '--remotes', '--tags', 'HEAD'] : ['HEAD']

  // `git log` fails in a repo with no commits, so check first.
  const head = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], {
    cwd: repoPath,
    okExitCodes: [0, 1, 128],
  })
  if (head.exitCode !== 0 && scope === 'head') return []
  // With 'all', an unborn HEAD is fine as long as other refs exist; drop HEAD
  // from the list so git doesn't fail on it.
  const revs = head.exitCode === 0 ? revisions : revisions.filter((r) => r !== 'HEAD')

  const { stdout } = await runGit(
    [
      'log',
      ...LOG_FORMAT_ARGS,
      '--topo-order',
      `--max-count=${limit}`,
      `--skip=${skip}`,
      ...revs,
      '--',
    ],
    { cwd: repoPath },
  )
  return parseCommits(stdout)
}
