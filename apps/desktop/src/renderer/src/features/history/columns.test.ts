import { describe, expect, it } from 'vitest'
import { toggleColumn, visibleColumns } from './columns'

describe('history columns', () => {
  it('shows chosen columns in display order, skipping unknown ones', () => {
    expect(visibleColumns(['sha', 'author', 'gone']).map((c) => c.id)).toEqual(['author', 'sha'])
  })

  it('toggles a column on or off, keeping display order', () => {
    expect(toggleColumn(['author', 'sha'], 'changes')).toEqual(['changes', 'author', 'sha'])
    expect(toggleColumn(['author', 'sha'], 'author')).toEqual(['sha'])
  })
})
