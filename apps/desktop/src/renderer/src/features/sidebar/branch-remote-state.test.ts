import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import { branchRemoteState } from './branch-remote-state'

function ref(partial: Partial<Ref> & Pick<Ref, 'name' | 'type'>): Ref {
  return {
    fullName: partial.name,
    sha: 'a'.repeat(40),
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    ...partial,
  }
}

describe('branchRemoteState', () => {
  const refs = [ref({ name: 'origin/shared', type: 'remote-branch', remote: 'origin' })]

  it('tells tracking, gone, untracked and local-only branches apart', () => {
    expect(branchRemoteState(ref({ name: 'a', type: 'branch', upstream: 'origin/a' }), refs)).toBe(
      'tracking',
    )
    expect(
      branchRemoteState(
        ref({ name: 'a', type: 'branch', upstream: 'origin/a', upstreamGone: true }),
        refs,
      ),
    ).toBe('gone')
    expect(branchRemoteState(ref({ name: 'shared', type: 'branch' }), refs)).toBe('untracked')
    expect(branchRemoteState(ref({ name: 'mine', type: 'branch' }), refs)).toBe('local-only')
  })
})
