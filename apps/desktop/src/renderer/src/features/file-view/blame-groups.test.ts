import { describe, expect, it } from 'vitest'
import { ageScale, groupBlameLines } from './blame-groups'

const line = (sha: string, n: number) => ({ sha, line: n, origLine: n, text: `l${n}` })

describe('groupBlameLines', () => {
  it('groups consecutive lines from the same commit', () => {
    const groups = groupBlameLines([line('a', 1), line('a', 2), line('b', 3), line('a', 4)])
    expect(groups.map((g) => [g.sha, g.lines.length])).toEqual([
      ['a', 2],
      ['b', 1],
      ['a', 1],
    ])
  })
})

describe('ageScale', () => {
  it('ranks times from oldest (0) to newest (1)', () => {
    const scale = ageScale([100, 5000, 300, 300])
    expect([scale(100), scale(300), scale(5000)]).toEqual([0, 0.5, 1])
    expect(ageScale([7])(7)).toBe(1)
  })
})
