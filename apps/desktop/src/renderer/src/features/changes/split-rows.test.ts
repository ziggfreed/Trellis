import { describe, expect, it } from 'vitest'
import { splitRows } from './split-rows'

const kinds = (s: string) =>
  [...s].map((c) => ({ kind: c === '+' ? 'add' : c === '-' ? 'delete' : 'context' }) as const)

describe('splitRows', () => {
  it('puts context on both sides and pairs deletions with additions', () => {
    expect(splitRows(kinds(' --+ '))).toEqual([
      { left: 0, right: 0 },
      { left: 1, right: 3 },
      { left: 2, right: null },
      { left: 4, right: 4 },
    ])
  })

  it('handles additions only, deletions only, and a delete after adds', () => {
    expect(splitRows(kinds('++'))).toEqual([
      { left: null, right: 0 },
      { left: null, right: 1 },
    ])
    expect(splitRows(kinds('+-'))).toEqual([
      { left: null, right: 0 },
      { left: 1, right: null },
    ])
  })
})
