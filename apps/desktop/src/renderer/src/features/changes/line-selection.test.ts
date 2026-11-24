import { describe, expect, it } from 'vitest'
import { selectRange, toggleLine } from './line-selection'

describe('line selection', () => {
  it('toggles single lines', () => {
    const once = toggleLine(new Set(), '0:1')
    expect([...once]).toEqual(['0:1'])
    expect([...toggleLine(once, '0:1')]).toEqual([])
  })

  it('selects ranges in either direction, across hunks', () => {
    const ordered = ['0:1', '0:2', '1:0', '1:3']
    expect([...selectRange(new Set(), ordered, '0:2', '1:3')]).toEqual(['0:2', '1:0', '1:3'])
    expect([...selectRange(new Set(['0:1']), ordered, '1:0', '0:1')]).toEqual(['0:1', '0:2', '1:0'])
  })
})
