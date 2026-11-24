import { describe, expect, it } from 'vitest'
import type { BranchStatus, Remote } from '@shared/ipc'
import { planPush } from './push-plan'

const branch = (patch: Partial<BranchStatus>): BranchStatus => ({
  head: 'main',
  oid: 'abc',
  upstream: null,
  ahead: 0,
  behind: 0,
  ...patch,
})
const remotes = (...names: string[]): Remote[] =>
  names.map((name) => ({ name, fetchUrl: '', pushUrl: '' }))

describe('planPush', () => {
  it('pushes to the upstream when there is one', () => {
    expect(
      planPush(branch({ head: 'feature/x', upstream: 'origin/feature/x' }), remotes('origin')),
    ).toEqual({
      ok: true,
      request: { remote: 'origin', branch: 'feature/x', remoteBranch: 'feature/x' },
    })
  })

  it('matches remotes whose names contain a slash', () => {
    const plan = planPush(branch({ upstream: 'my/fork/main' }), remotes('my', 'my/fork'))
    expect(plan).toMatchObject({ request: { remote: 'my/fork', remoteBranch: 'main' } })
  })

  it('sets an upstream on origin for a new branch', () => {
    expect(planPush(branch({ head: 'new' }), remotes('upstream', 'origin'))).toEqual({
      ok: true,
      request: { remote: 'origin', branch: 'new', setUpstream: true },
    })
  })

  it('uses the only remote when there is no origin', () => {
    expect(planPush(branch({}), remotes('github'))).toMatchObject({ request: { remote: 'github' } })
  })

  it('explains when pushing is impossible', () => {
    expect(planPush(branch({ head: null }), remotes('origin')).ok).toBe(false)
    expect(planPush(branch({ oid: null }), remotes('origin')).ok).toBe(false)
    expect(planPush(branch({}), []).ok).toBe(false)
  })
})
