import { describe, expect, it } from 'vitest'
import { comparePaths, countChanges, groupChanges } from './group-changes'

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
    expect(groups.unstaged.map((e) => e.path)).toEqual(['a.ts', 'b.ts', 'new.txt'])
    expect(countChanges(groups)).toBe(6)
  })

  it('lists new (untracked) files with the other changes in their folder', () => {
    const groups = groupChanges([
      { path: 'src/new.ts', staged: null, unstaged: 'untracked' },
      { path: 'src/app.ts', staged: null, unstaged: 'modified' },
      { path: 'README.md', staged: null, unstaged: 'modified' },
      { path: 'docs/guide.md', staged: null, unstaged: 'untracked' },
    ])
    expect(groups.unstaged.map((e) => e.path)).toEqual([
      'README.md',
      'docs/guide.md',
      'src/app.ts',
      'src/new.ts',
    ])
  })
})

describe('comparePaths', () => {
  const sorted = (paths: string[]) => [...paths].sort(comparePaths)

  it("groups files by folder, with a folder's own files before its subfolders", () => {
    expect(
      sorted(['src/ui/button.tsx', 'test/app.test.ts', 'src/main.ts', 'README.md', 'src/app.ts']),
    ).toEqual(['README.md', 'src/app.ts', 'src/main.ts', 'src/ui/button.tsx', 'test/app.test.ts'])
  })

  it("doesn't split a folder's files with a subfolder, as sorting the text would", () => {
    // Sorted as plain text, src/a/ lands between src/a.ts and src/a0.ts.
    expect(sorted(['src/a0.ts', 'src/a/b.ts', 'src/a.ts', 'src/ab.ts', 'src/a/c.ts'])).toEqual([
      'src/a.ts',
      'src/a0.ts',
      'src/ab.ts',
      'src/a/b.ts',
      'src/a/c.ts',
    ])
  })

  it('ignores case and puts numbers in numeric order', () => {
    expect(sorted(['b.txt', 'File10.txt', 'file2.txt', 'A.txt'])).toEqual([
      'A.txt',
      'b.txt',
      'file2.txt',
      'File10.txt',
    ])
  })
})
