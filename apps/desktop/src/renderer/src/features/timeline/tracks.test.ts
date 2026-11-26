import { describe, expect, it } from 'vitest'
import type { Commit } from '@shared/ipc'
import { buildTimeline, mergedBranchName } from './tracks'
import type { TrackRef } from './timeline-refs'

const HOUR = 60 * 60 * 1000

/** A commit with just the fields the layout uses; `hour` sets its date. */
function c(sha: string, parents: string[], hour: number, subject = sha): Commit {
  return {
    sha,
    parents,
    subject,
    body: '',
    authorName: 'A',
    authorEmail: 'a@x',
    authorDate: hour * HOUR,
    committerName: 'A',
    committerEmail: 'a@x',
    commitDate: hour * HOUR,
  }
}

const ref = (name: string, sha: string): TrackRef => ({
  fullName: `refs/heads/${name}`,
  name,
  sha,
  type: 'branch',
})

/**
 * main:    m1 - m2 ------- m3 (merge of "login") - m4
 *                \        /
 * login:          l1 - l2      (branch deleted after merging)
 *                  \
 * feature:          f1 - f2
 *
 * l1 is on feature's first-parent line, so feature's track claims it and
 * the merged "login" track is just l2, forking from feature.
 */
const commits = [
  c('m4', ['m3'], 100),
  c('m3', ['m2', 'l2'], 90, "Merge branch 'login'"),
  c('f2', ['f1'], 80),
  c('l2', ['l1'], 60),
  c('f1', ['l1'], 50),
  c('l1', ['m2'], 40),
  c('m2', ['m1'], 20),
  c('m1', ['m0'], 10), // m0 isn't loaded
]
const refs = [ref('main', 'm4'), ref('feature', 'f2')]

describe('buildTimeline', () => {
  it('gives each branch its first-parent line, and leaves merged branches out by default', () => {
    const model = buildTimeline(commits, refs, { showMerged: false })
    expect(model.tracks.map((t) => [t.name, t.commits])).toEqual([
      ['main', ['m1', 'm2', 'm3', 'm4']],
      ['feature', ['l1', 'f1', 'f2']],
    ])
    expect(model.rows).toBe(2)
    expect(model.placed.has('l2')).toBe(false)
    // The merge of the hidden branch gets a stub, and m1 continues before
    // the loaded history.
    expect(model.stubs).toContainEqual({ sha: 'm3', kind: 'merged' })
    expect(model.stubs).toContainEqual({ sha: 'm1', kind: 'before' })
  })

  it('shows merged branches, named from the merge message, with fork and merge lines', () => {
    const model = buildTimeline(commits, refs, { showMerged: true })
    const login = model.tracks[2]!
    expect(login).toMatchObject({ name: 'login', ref: null, commits: ['l2'], mergedInto: 'm3' })
    expect(login.row).toBe(2)
    expect(model.mergedRowStart).toBe(2)
    expect(model.edges).toContainEqual({ from: 'l2', to: 'm3', kind: 'merge', color: login.color })
    expect(model.edges).toContainEqual({ from: 'l1', to: 'l2', kind: 'fork', color: login.color })
    expect(model.edges).toContainEqual({ from: 'm2', to: 'l1', kind: 'fork', color: 1 })
    expect(model.edges).toContainEqual({ from: 'l1', to: 'f1', kind: 'line', color: 1 })
    expect(model.edges).toContainEqual({ from: 'm3', to: 'm4', kind: 'line', color: 0 })
  })

  it('lets merged branches share a row when they don’t overlap in time', () => {
    const history = [
      c('m5', ['m4', 'b2'], 100, "Merge branch 'b'"),
      c('b2', ['b1'], 95),
      c('b1', ['m4'], 92),
      c('m4', ['m3'], 90),
      c('m3', ['m2', 'a1'], 50, "Merge branch 'a'"),
      c('a1', ['m2'], 30),
      c('m2', [], 10),
    ]
    const model = buildTimeline(history, [ref('main', 'm5')], { showMerged: true })
    const rows = model.tracks.slice(1).map((t) => [t.name, t.row])
    expect(rows).toEqual([
      ['b', 1],
      ['a', 1],
    ])
    expect(model.rows).toBe(2)
  })

  it('marks branches whose commit is on another track or not loaded', () => {
    const model = buildTimeline(commits, [...refs, ref('same', 'm2'), ref('old', 'zz')], {
      showMerged: false,
    })
    expect(model.tracks.map((t) => [t.name, t.tip, t.commits.length])).toEqual([
      ['main', 'own', 4],
      ['feature', 'own', 3],
      ['same', 'shared', 0],
      ['old', 'outside', 0],
    ])
  })
})

describe('mergedBranchName', () => {
  it.each([
    ["Merge branch 'login'", 'login'],
    ["Merge branch 'feature/x' into main", 'feature/x'],
    ['Merge pull request #12 from octo/fix-crash', 'fix-crash (#12)'],
    ["Merge remote-tracking branch 'origin/dev'", 'dev'],
    ['Merged in hotfix (pull request #7)', 'hotfix (#7)'],
    ['Fix the build', null],
  ])('%s -> %s', (subject, name) => {
    expect(mergedBranchName(subject)).toBe(name)
  })
})
