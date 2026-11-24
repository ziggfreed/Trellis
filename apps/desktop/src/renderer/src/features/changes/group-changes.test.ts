import { describe, expect, it } from 'vitest'
import { countChanges, groupChanges } from './group-changes'

describe('groupChanges', () => {
  it('splits files into conflicted, staged and unstaged groups', () => {
    const groups = groupChanges([
      { path: 'b.ts', staged: 'modified', unstaged: 'modified' },
      { path: 'new.txt', staged: null, unstaged: 'untracked' },
      { path: 'a.ts', staged: null, unstaged: 'deleted' },
      { path: 'clash.ts', staged: null, unstaged: 'conflicted' },
      { path: 'moved.ts', origPath: 'old.ts', staged: 'renamed', unstaged: null },
    ])
    expect(groups.conflicted.map((e) => e.path)).toEqual(['clash.ts'])
    expect(groups.staged).toEqual([
      { path: 'b.ts', change: 'modified', area: 'staged' },
      { path: 'moved.ts', origPath: 'old.ts', change: 'renamed', area: 'staged' },
    ])
    // Tracked changes first (sorted), then untracked files.
    expect(groups.unstaged.map((e) => e.path)).toEqual(['a.ts', 'b.ts', 'new.txt'])
    expect(countChanges(groups)).toBe(6)
  })
})
