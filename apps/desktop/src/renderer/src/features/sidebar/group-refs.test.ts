import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import {
  groupRemoteBranches,
  localBranches,
  refsBySha,
  remoteBranchShortName,
  sortedTags,
} from './group-refs'

function ref(type: Ref['type'], name: string, extra: Partial<Ref> = {}): Ref {
  return {
    fullName: name,
    name,
    type,
    sha: 'sha-' + name,
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    ...extra,
  }
}

describe('localBranches', () => {
  it('puts the current branch first, then sorts by name', () => {
    const refs = [
      ref('branch', 'zeta'),
      ref('branch', 'main', { isHead: true }),
      ref('branch', 'alpha'),
    ]
    expect(localBranches(refs).map((r) => r.name)).toEqual(['main', 'alpha', 'zeta'])
  })
})

describe('groupRemoteBranches', () => {
  it('groups by remote, including remotes without branches', () => {
    const refs = [
      ref('remote-branch', 'origin/main', { remote: 'origin' }),
      ref('remote-branch', 'upstream/dev', { remote: 'upstream' }),
      ref('remote-branch', 'origin/dev', { remote: 'origin' }),
      ref('branch', 'main'),
    ]
    const remotes = ['origin', 'upstream', 'backup'].map((name) => ({
      name,
      fetchUrl: '',
      pushUrl: '',
    }))
    expect(
      groupRemoteBranches(refs, remotes).map((g) => [g.remote, g.branches.map((b) => b.name)]),
    ).toEqual([
      ['backup', []],
      ['origin', ['origin/dev', 'origin/main']],
      ['upstream', ['upstream/dev']],
    ])
  })
})

describe('sortedTags', () => {
  it('sorts versions naturally, newest first', () => {
    const refs = ['v1.9', 'v1.10', 'v1.2'].map((n) => ref('tag', n))
    expect(sortedTags(refs).map((r) => r.name)).toEqual(['v1.10', 'v1.9', 'v1.2'])
  })
})

describe('remoteBranchShortName', () => {
  it('strips the remote name', () => {
    expect(
      remoteBranchShortName(ref('remote-branch', 'origin/feature/x', { remote: 'origin' })),
    ).toBe('feature/x')
  })
})

describe('refsBySha', () => {
  it('groups refs by commit with the current branch first', () => {
    const refs = [
      ref('tag', 'v1', { sha: 'a' }),
      ref('remote-branch', 'origin/main', { sha: 'a', remote: 'origin' }),
      ref('branch', 'main', { sha: 'a', isHead: true }),
      ref('branch', 'other', { sha: 'b' }),
    ]
    const map = refsBySha(refs)
    expect(map.get('a')?.map((r) => r.name)).toEqual(['main', 'origin/main', 'v1'])
    expect(map.get('b')?.map((r) => r.name)).toEqual(['other'])
  })
})
