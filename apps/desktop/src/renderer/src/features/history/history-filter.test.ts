import { describe, expect, it } from 'vitest'
import { activeFilterCount, buildCommitFilter } from './history-filter'

describe('history filter', () => {
  it('counts the fields that are set', () => {
    expect(activeFilterCount({})).toBe(0)
    expect(activeFilterCount({ author: 'ann', path: ' ', since: '2026-01-01' })).toBe(2)
  })

  it('combines search text and filter fields, dropping blanks', () => {
    expect(buildCommitFilter('  ', {})).toBeNull()
    expect(buildCommitFilter(' login ', { author: '', path: 'src ' })).toEqual({
      text: 'login',
      path: 'src',
    })
  })
})
