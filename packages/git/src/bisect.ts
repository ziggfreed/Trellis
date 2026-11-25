/**
 * Bisect: finding the commit that introduced a bug by binary search.
 *
 *   1. Mark a commit where the bug exists as "bad" and one where it didn't
 *      as "good".
 *   2. Git checks out a commit halfway between them. You test it and mark it
 *      good or bad (or "skip" if it can't be tested).
 *   3. Each answer halves the range, so even 1,000 commits take about 10
 *      steps, until one commit is left: the first bad one.
 *
 * Git keeps the marks as refs (refs/bisect/bad, refs/bisect/good-<sha>,
 * refs/bisect/skip-<sha>), so the state can always be read back from the
 * repository, whoever started the bisect.
 */
import { runGit } from './run-git'
import type { BisectState } from './types'

/** Parse `git for-each-ref --format=%(refname)%00%(objectname) refs/bisect/`. */
export function parseBisectRefs(output: string): {
  bad: string | null
  good: string[]
  skipped: string[]
} {
  let bad: string | null = null
  const good: string[] = []
  const skipped: string[] = []
  for (const line of output.split('\n')) {
    const [ref, sha] = line.split('\0')
    if (!ref || !sha) continue
    if (ref === 'refs/bisect/bad') bad = sha
    else if (ref.startsWith('refs/bisect/good-')) good.push(sha)
    else if (ref.startsWith('refs/bisect/skip-')) skipped.push(sha)
  }
  return { bad, good, skipped }
}

/** Where a bisect is up to, or null when none is running. */
export async function getBisectState(repoPath: string): Promise<BisectState | null> {
  // `git bisect log` fails when no bisect is running.
  const log = await runGit(['bisect', 'log'], { cwd: repoPath, okExitCodes: [0, 1, 128] })
  if (log.exitCode !== 0) return null

  const refs = await runGit(
    ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/bisect/'],
    { cwd: repoPath },
  )
  const { bad, good, skipped } = parseBisectRefs(refs.stdout)
  const head = await runGit(['rev-parse', 'HEAD'], { cwd: repoPath, okExitCodes: [0, 128] })

  // Commits still in question: reachable from the bad one, not from any good one.
  let remaining: number | null = null
  if (bad && good.length) {
    const count = await runGit(['rev-list', '--count', bad, '--not', ...good], { cwd: repoPath })
    remaining = Number(count.stdout.trim())
  }
  return {
    bad,
    good,
    skipped,
    current: head.exitCode === 0 ? head.stdout.trim() : null,
    remaining,
    // One commit left (the bad one itself): that's the culprit.
    culprit: remaining === 1 ? bad : null,
  }
}

/**
 * Start bisecting with a known bad commit and, optionally, a known good one
 * (otherwise mark one next). Git checks out a commit to test as soon as it
 * has both.
 */
export async function bisectStart(repoPath: string, bad: string, good?: string): Promise<void> {
  await runGit(['bisect', 'start'], { cwd: repoPath })
  try {
    await runGit(['bisect', 'bad', bad], { cwd: repoPath })
    if (good) await runGit(['bisect', 'good', good], { cwd: repoPath })
  } catch (error) {
    // Don't leave a half-started bisect behind.
    await runGit(['bisect', 'reset'], { cwd: repoPath, okExitCodes: [0, 1, 128] })
    throw error
  }
}

/** Mark a commit (default: the one checked out) good, bad, or untestable. */
export async function bisectMark(
  repoPath: string,
  verdict: 'good' | 'bad' | 'skip',
  sha?: string,
): Promise<void> {
  await runGit(['bisect', verdict, ...(sha ? [sha] : [])], { cwd: repoPath })
}

/** Stop bisecting and go back to the branch you started from. */
export async function bisectReset(repoPath: string): Promise<void> {
  await runGit(['bisect', 'reset'], { cwd: repoPath })
}
