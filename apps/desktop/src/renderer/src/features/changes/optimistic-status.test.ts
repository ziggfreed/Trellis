import { describe, expect, it } from 'vitest'
import type { FileStatus, RepoStatus } from '@shared/ipc'
import { afterDiscard, afterStage, afterUnstage } from './optimistic-status'

const status = (...files: FileStatus[]): RepoStatus => ({
  branch: { head: 'main', oid: 'a'.repeat(40), upstream: null, ahead: 0, behind: 0 },
  files,
  operation: null,
})
const file = (path: string, staged: FileStatus['staged'], unstaged: FileStatus['unstaged']) => ({
  path,
  staged,
  unstaged,
})

describe('afterStage', () => {
  it('moves working-tree changes into the index', () => {
    const before = status(
      file('a', null, 'modified'),
      file('new', null, 'untracked'),
      file('gone', null, 'deleted'),
      file('other', null, 'modified'),
    )
    expect(afterStage(before, ['a', 'new', 'gone']).files).toEqual([
      file('a', 'modified', null),
      file('new', 'added', null),
      file('gone', 'deleted', null),
      file('other', null, 'modified'),
    ])
  })

  it('keeps added/renamed files as they are, drops added-then-deleted, leaves conflicts', () => {
    const before = status(
      file('added', 'added', 'modified'),
      file('brief', 'added', 'deleted'),
      file('clash', null, 'conflicted'),
    )
    expect(afterStage(before, ['added', 'brief', 'clash']).files).toEqual([
      file('added', 'added', null),
      file('clash', null, 'conflicted'),
    ])
  })
})

describe('afterUnstage', () => {
  it('moves staged changes back to the working tree', () => {
    const before = status(
      file('a', 'modified', null),
      file('both', 'modified', 'modified'),
      file('new', 'added', null),
      file('moved', 'renamed', null),
    )
    expect(afterUnstage(before, ['a', 'both', 'new', 'moved']).files).toEqual([
      file('a', null, 'modified'),
      file('both', null, 'modified'),
      file('new', null, 'untracked'),
      file('moved', 'renamed', null), // left for git to work out
    ])
  })
})

describe('afterDiscard', () => {
  it('removes untracked files and working-tree changes, keeping staged ones', () => {
    const before = status(
      file('a', null, 'modified'),
      file('new', null, 'untracked'),
      file('half', 'modified', 'modified'),
    )
    expect(
      afterDiscard(before, [
        { path: 'a', untracked: false },
        { path: 'new', untracked: true },
        { path: 'half', untracked: false },
      ]).files,
    ).toEqual([file('half', 'modified', null)])
  })
})
