import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import { checkoutChoiceForCommit, checkoutChoiceForRef } from './checkout-target'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

function ref(name: string, type: Ref['type'], sha: string, extra: Partial<Ref> = {}): Ref {
  const remote = type === 'remote-branch' ? name.split('/')[0] : undefined
  return {
    fullName: name,
    name,
    type,
    sha,
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    ...(remote ? { remote } : {}),
    ...extra,
  }
}

describe('checkoutChoiceForCommit', () => {
  it('does nothing when the commit’s branch is already checked out', () => {
    const refs = [ref('main', 'branch', A, { isHead: true }), ref('other', 'branch', A)]
    expect(checkoutChoiceForCommit(A, refs, A)).toEqual({ kind: 'current', label: 'main' })
  })

  it('prefers a local branch, then a remote branch with no local copy, then the commit', () => {
    const main = ref('main', 'branch', B, { isHead: true })
    expect(checkoutChoiceForCommit(A, [main, ref('feature', 'branch', A)], B)).toEqual({
      kind: 'branch',
      name: 'feature',
    })
    const remote = ref('origin/feature', 'remote-branch', A)
    expect(checkoutChoiceForCommit(A, [main, remote], B)).toEqual({
      kind: 'remote-branch',
      ref: remote,
    })
    expect(checkoutChoiceForCommit(A, [main], B)).toEqual({ kind: 'commit', sha: A })
  })

  it('skips a remote branch whose local branch is somewhere else', () => {
    const refs = [
      ref('main', 'branch', B, { isHead: true }),
      ref('feature', 'branch', B),
      ref('origin/feature', 'remote-branch', A),
    ]
    expect(checkoutChoiceForCommit(A, refs, B)).toEqual({ kind: 'commit', sha: A })
  })

  it('does nothing when already detached on the commit', () => {
    expect(checkoutChoiceForCommit(A, [], A)).toEqual({ kind: 'current', label: 'this commit' })
  })
})

describe('checkoutChoiceForRef', () => {
  it('checks out branches, remote branches and tags', () => {
    const remote = ref('origin/x', 'remote-branch', A)
    expect(checkoutChoiceForRef(ref('x', 'branch', A), [])).toEqual({ kind: 'branch', name: 'x' })
    expect(checkoutChoiceForRef(remote, [])).toEqual({ kind: 'remote-branch', ref: remote })
    expect(checkoutChoiceForRef(ref('v1', 'tag', A), [])).toEqual({ kind: 'commit', sha: A })
  })

  it('does nothing for a remote branch whose local branch is checked out', () => {
    const refs = [ref('x', 'branch', A, { isHead: true })]
    expect(checkoutChoiceForRef(ref('origin/x', 'remote-branch', A), refs)).toEqual({
      kind: 'current',
      label: 'x',
    })
  })
})
