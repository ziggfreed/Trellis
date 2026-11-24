import { describe, expect, it } from 'vitest'
import type { Commit } from '@shared/ipc'
import { initialRows, isUnchanged, moveRow, resultCount, toPlan } from './rebase-list'

const commit = (sha: string, subject: string, body = ''): Commit => ({
  sha,
  parents: [],
  authorName: '',
  authorEmail: '',
  authorDate: 0,
  committerName: '',
  committerEmail: '',
  commitDate: 0,
  subject,
  body,
})
const commits = [commit('a', 'A', 'body'), commit('b', 'B'), commit('c', 'C')]

describe('rebase list helpers', () => {
  it('starts with every commit picked and its full message', () => {
    const rows = initialRows(commits)
    expect(rows.map((r) => [r.action, r.message])).toEqual([
      ['pick', 'A\n\nbody'],
      ['pick', 'B'],
      ['pick', 'C'],
    ])
    expect(isUnchanged(rows, commits)).toBe(true)
  })

  it('moves rows', () => {
    expect(moveRow(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveRow(['a', 'b', 'c'], 0, 5)).toEqual(['a', 'b', 'c'])
  })

  it('builds the plan and counts the result', () => {
    const rows = initialRows(commits)
    rows[0]!.action = 'reword'
    rows[0]!.message = 'New A'
    rows[1]!.action = 'squash'
    rows[2]!.action = 'drop'
    expect(toPlan(rows)).toEqual([
      { sha: 'a', action: 'reword', message: 'New A' },
      { sha: 'b', action: 'squash' },
      { sha: 'c', action: 'drop' },
    ])
    expect(resultCount(rows)).toBe(1)
    expect(isUnchanged(rows, commits)).toBe(false)
  })
})
