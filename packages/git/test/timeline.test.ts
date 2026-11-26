/**
 * Tests for the timeline's data: commits by period, branch activity dates
 * and ahead/behind counts. Commits get fixed dates so periods are exact.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { getAheadBehind, getBranchActivity, getTimeline, runGit } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let r: TempRepo | undefined
afterEach(async () => {
  await r?.cleanup()
  r = undefined
})

const DAY = 24 * 60 * 60 * 1000
/** A fixed "now" so the tests don't depend on the clock: 2026-06-01 12:00 UTC. */
const NOW = Date.UTC(2026, 5, 1, 12)

/** Commit everything with both dates set to `daysAgo` days before NOW. */
async function commitAt(repo: TempRepo, message: string, daysAgo: number): Promise<string> {
  const date = new Date(NOW - daysAgo * DAY).toISOString()
  await repo.write(`${message}.txt`, message)
  await repo.git('add', '-A')
  await runGit(['commit', '-m', message], {
    cwd: repo.path,
    env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
  return (await repo.git('rev-parse', 'HEAD')).trim()
}

/** main: commits 30, 20, 10 and 2 days ago; feature (from day 20): 15 and 5 days ago. */
async function repoWithHistory() {
  const repo = await createTempRepo()
  await commitAt(repo, 'm30', 30)
  await commitAt(repo, 'm20', 20)
  await repo.git('switch', '-c', 'feature')
  await commitAt(repo, 'f15', 15)
  await commitAt(repo, 'f5', 5)
  await repo.git('switch', 'main')
  await commitAt(repo, 'm10', 10)
  await commitAt(repo, 'm2', 2)
  return repo
}

const BOTH = ['refs/heads/main', 'refs/heads/feature']
const subjects = (page: { commits: { subject: string }[] }) => page.commits.map((c) => c.subject)

describe('getTimeline', () => {
  it('returns the commits in a period, newest first, and says if there are older ones', async () => {
    r = await repoWithHistory()
    const page = await getTimeline(r.path, {
      refs: BOTH,
      since: NOW - 12 * DAY,
      until: null,
      limit: 100,
    })
    expect(subjects(page)).toEqual(['m2', 'f5', 'm10'])
    expect(page.from).toBe(NOW - 12 * DAY)
    expect(page.hasMore).toBe(true)

    const older = await getTimeline(r.path, {
      refs: BOTH,
      since: NOW - 40 * DAY,
      until: page.from,
      limit: 100,
    })
    expect(subjects(older)).toEqual(['f15', 'm20', 'm30'])
    expect(older.hasMore).toBe(false)
  })

  it('only follows the refs it is given', async () => {
    r = await repoWithHistory()
    const page = await getTimeline(r.path, {
      refs: ['refs/heads/main'],
      since: NOW - 40 * DAY,
      until: null,
      limit: 100,
    })
    expect(subjects(page)).toEqual(['m2', 'm10', 'm20', 'm30'])
  })

  it('when the limit is reached, covers the period only back to the oldest commit returned', async () => {
    r = await repoWithHistory()
    const page = await getTimeline(r.path, {
      refs: BOTH,
      since: NOW - 40 * DAY,
      until: null,
      limit: 2,
    })
    expect(subjects(page)).toEqual(['m2', 'f5'])
    expect(page.from).toBe(NOW - 5 * DAY)
    expect(page.hasMore).toBe(true)
  })

  it('returns nothing for no refs', async () => {
    r = await createTempRepo()
    const page = await getTimeline(r.path, { refs: [], since: 0, until: null, limit: 10 })
    expect(page).toEqual({ commits: [], from: 0, hasMore: false })
  })
})

describe('getBranchActivity', () => {
  it('gives the date of each branch tip', async () => {
    r = await repoWithHistory()
    const activity = await getBranchActivity(r.path)
    expect(activity).toEqual({
      'refs/heads/main': NOW - 2 * DAY,
      'refs/heads/feature': NOW - 5 * DAY,
    })
  })
})

describe('getAheadBehind', () => {
  it('counts commits on each side of the fork point', async () => {
    r = await repoWithHistory()
    const counts = await getAheadBehind(r.path, 'refs/heads/main', [
      'refs/heads/feature',
      'refs/heads/missing',
    ])
    expect(counts).toEqual({ 'refs/heads/feature': { ahead: 2, behind: 2 } })
  })
})
