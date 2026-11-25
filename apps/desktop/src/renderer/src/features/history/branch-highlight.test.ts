import { describe, expect, it } from 'vitest'
import { firstParentLine, firstParentMap } from './branch-highlight'

const c = (sha: string, ...parents: string[]) => ({ sha, parents })

describe('firstParentLine', () => {
  // M merges feature F into main; main is M → B → A, F's line is F → B.
  const parents = firstParentMap([c('M', 'B', 'F'), c('F', 'B'), c('B', 'A'), c('A')])

  it('follows first parents from the tip', () => {
    expect([...firstParentLine(parents, 'M')]).toEqual(['M', 'B', 'A'])
    expect([...firstParentLine(parents, 'F')]).toEqual(['F', 'B', 'A'])
  })

  it('stops where loaded history ends, and is empty for an unknown tip', () => {
    const partial = firstParentMap([c('M', 'B', 'F'), c('B', 'A')])
    expect([...firstParentLine(partial, 'M')]).toEqual(['M', 'B'])
    expect(firstParentLine(partial, 'nope').size).toBe(0)
  })
})
