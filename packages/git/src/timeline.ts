/**
 * Data for the history timeline (the horizontal view of branches over time).
 *
 * The timeline loads history by period rather than by count: "every commit
 * on these branches from the last three months", then the three months
 * before that, and so on as the user scrolls back in time. Commits come in
 * date order (newest first, but never a parent before its child), so if a
 * period has more commits than the limit, the ones left out are the oldest
 * and the next period can carry on from exactly where this one stopped.
 *
 * It also needs two cheap facts about branches: when each was last
 * committed to (to fade stale branches and pick "active" ones), and how far
 * each is ahead of and behind the main branch.
 */
import { runGit } from './run-git'
import { LOG_FORMAT_ARGS, parseCommits } from './log'
import type { AheadBehind, TimelinePage, TimelineRange } from './types'

/** A date as git understands it on the command line. */
const gitDate = (ms: number) => new Date(ms).toISOString()

/**
 * Commits reachable from `range.refs` with a commit date inside the range.
 * Returns an empty page when `refs` is empty.
 */
export async function getTimeline(repoPath: string, range: TimelineRange): Promise<TimelinePage> {
  const { refs, since, until, limit } = range
  if (refs.length === 0) return { commits: [], from: since, hasMore: false }
  const { stdout } = await runGit(
    [
      'log',
      ...LOG_FORMAT_ARGS,
      // Date order (not topological), so hitting the limit cuts off the
      // oldest commits rather than a random side branch.
      '--date-order',
      `--max-count=${limit}`,
      `--since=${gitDate(since)}`,
      ...(until === null ? [] : [`--until=${gitDate(until)}`]),
      ...refs,
      '--',
    ],
    { cwd: repoPath },
  )
  const commits = parseCommits(stdout)
  const truncated = commits.length >= limit
  // When cut short, the period is only complete back to the oldest commit we
  // got. (Commits sharing that exact second may come again in the next page;
  // the UI skips hashes it already has.)
  const from = truncated ? Math.min(...commits.map((c) => c.commitDate)) : since

  // Is there anything older? Ask git for one commit before `from`.
  const older = await runGit(
    ['rev-list', '--max-count=1', `--until=${gitDate(from - 1000)}`, ...refs, '--'],
    { cwd: repoPath },
  )
  return { commits, from, hasMore: older.stdout.trim() !== '' }
}

/**
 * When each branch (local and remote) last had a commit: full ref name ->
 * commit date of its tip (Unix time in milliseconds). One fast git command,
 * however many branches there are.
 */
export async function getBranchActivity(repoPath: string): Promise<Record<string, number>> {
  const { stdout } = await runGit(
    ['for-each-ref', '--format=%(refname)%00%(committerdate:unix)', 'refs/heads', 'refs/remotes'],
    { cwd: repoPath },
  )
  const activity: Record<string, number> = {}
  for (const line of stdout.split('\n')) {
    const [name, seconds] = line.split('\0')
    // Skip "origin/HEAD", which only points at another remote branch.
    if (!name || !seconds || name.endsWith('/HEAD')) continue
    activity[name] = Number(seconds) * 1000
  }
  return activity
}

/** How many branches to count at once (each is one git process). */
const COUNT_CONCURRENCY = 6

/**
 * For each of `heads`, how many commits it has that `base` doesn't (ahead)
 * and how many `base` has that it doesn't (behind). Heads that can't be
 * compared (deleted meanwhile, unrelated histories) are left out.
 */
export async function getAheadBehind(
  repoPath: string,
  base: string,
  heads: string[],
): Promise<Record<string, AheadBehind>> {
  const result: Record<string, AheadBehind> = {}
  const queue = [...new Set(heads)]
  const worker = async () => {
    for (let head = queue.shift(); head !== undefined; head = queue.shift()) {
      // `base...head` with --left-right counts each side of the fork point:
      // left = commits only on base (behind), right = only on head (ahead).
      const counts = await runGit(
        ['rev-list', '--left-right', '--count', `${base}...${head}`, '--'],
        {
          cwd: repoPath,
          okExitCodes: [0, 128],
        },
      )
      if (counts.exitCode !== 0) continue
      const [behind = 0, ahead = 0] = counts.stdout.trim().split(/\s+/).map(Number)
      result[head] = { ahead, behind }
    }
  }
  await Promise.all(Array.from({ length: Math.min(COUNT_CONCURRENCY, queue.length) }, worker))
  return result
}
