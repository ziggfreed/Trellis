import { describe, expect, it } from 'vitest'
import type { CleanupBranch, Ref } from '@shared/ipc'
import { byRemote, groupCleanup, namesToForce, suggestedNames } from './branch-cleanup'

function branch(partial: Partial<CleanupBranch> & Pick<CleanupBranch, 'name'>): CleanupBranch {
  return { merged: 'unmerged', aheadOfTarget: 1, upstream: null, upstreamGone: false, ...partial }
}

const refs: Ref[] = [
  {
    fullName: 'refs/remotes/origin/wip',
    name: 'origin/wip',
    type: 'remote-branch',
    remote: 'origin',
    sha: 'a'.repeat(40),
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
  },
]

describe('groupCleanup', () => {
  const candidates = [
    branch({ name: 'done', merged: 'merged', aheadOfTarget: 0 }),
    branch({
      name: 'squashed',
      merged: 'squashed',
      upstream: 'origin/squashed',
      upstreamGone: true,
    }),
    branch({ name: 'abandoned', upstream: 'origin/abandoned', upstreamGone: true }),
    branch({ name: 'experiment' }),
    branch({ name: 'active', upstream: 'origin/active' }),
    branch({ name: 'wip' }), // not tracking, but origin/wip exists: still in progress
  ]

  it('sorts branches into groups and hides ones still in progress', () => {
    const { groups, inProgress } = groupCleanup(candidates, refs, 'main')
    expect(groups.map((g) => [g.id, g.branches.map((b) => b.name)])).toEqual([
      ['merged', ['done']],
      ['squashed', ['squashed']],
      ['remote-deleted', ['abandoned']],
      ['local-only', ['experiment']],
    ])
    expect(inProgress).toBe(2)
    expect([...suggestedNames(groups)]).toEqual(['done', 'squashed'])
  })

  it('leaves out empty groups', () => {
    const { groups } = groupCleanup([candidates[0]!], refs, 'main')
    expect(groups.map((g) => g.id)).toEqual(['merged'])
  })

  it('forces deletion of everything git doesn’t see as merged', () => {
    expect(namesToForce(['done', 'squashed', 'abandoned'], candidates)).toEqual([
      'squashed',
      'abandoned',
    ])
  })
})

describe('byRemote', () => {
  it('groups remote branches by remote', () => {
    expect(
      byRemote([
        { remote: 'origin', branch: 'a' },
        { remote: 'fork', branch: 'b' },
        { remote: 'origin', branch: 'c' },
      ]),
    ).toEqual([
      { remote: 'origin', branches: ['a', 'c'] },
      { remote: 'fork', branches: ['b'] },
    ])
  })
})
