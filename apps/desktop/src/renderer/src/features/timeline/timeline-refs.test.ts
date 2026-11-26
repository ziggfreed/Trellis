import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import {
  MAX_DEFAULT_TRACKS,
  defaultTimelineRefs,
  isStale,
  orderTimelineRefs,
} from './timeline-refs'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 5, 1)

function branch(name: string, extra: Partial<Ref> = {}): Ref {
  return {
    fullName: `refs/heads/${name}`,
    name,
    type: 'branch',
    sha: name.padEnd(40, '0'),
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
    ...extra,
  }
}

function remote(name: string): Ref {
  return {
    ...branch(name),
    fullName: `refs/remotes/${name}`,
    type: 'remote-branch',
    remote: name.split('/')[0],
  }
}

const tag: Ref = { ...branch('v1'), fullName: 'refs/tags/v1', type: 'tag' }

describe('defaultTimelineRefs', () => {
  it('shows local branches and active remote branches no local branch stands for', () => {
    const refs = [
      branch('main', { upstream: 'origin/main' }),
      branch('feature', { isHead: true }),
      remote('origin/main'),
      remote('origin/feature'), // same name as a local branch
      remote('origin/fresh'),
      remote('origin/old'),
      tag,
    ]
    const activity = {
      'refs/heads/main': NOW - DAY,
      'refs/heads/feature': NOW - 3 * DAY,
      'refs/remotes/origin/main': NOW - DAY,
      'refs/remotes/origin/feature': NOW - DAY,
      'refs/remotes/origin/fresh': NOW - 2 * DAY,
      'refs/remotes/origin/old': NOW - 60 * DAY,
    }
    expect(defaultTimelineRefs(refs, activity, 'main', NOW).map((r) => r.name)).toEqual([
      'main',
      'feature',
      'origin/fresh',
    ])
  })

  it('keeps main and the checked-out branch when there are too many branches', () => {
    const many = Array.from({ length: MAX_DEFAULT_TRACKS + 5 }, (_, i) => branch(`b${i}`))
    const refs = [...many, branch('main'), branch('mine', { isHead: true })]
    const activity = Object.fromEntries(many.map((r, i) => [r.fullName, NOW - i * DAY]))
    const names = defaultTimelineRefs(refs, activity, 'main', NOW).map((r) => r.name)
    expect(names).toHaveLength(MAX_DEFAULT_TRACKS)
    expect(names.slice(0, 3)).toEqual(['main', 'mine', 'b0'])
  })
})

describe('orderTimelineRefs', () => {
  it('orders main, then the checked-out branch, then most recent first, and drops unknown names', () => {
    const refs = [branch('a'), branch('b', { isHead: true }), branch('main'), branch('c'), tag]
    const activity = { 'refs/heads/a': NOW - 5 * DAY, 'refs/heads/c': NOW - DAY }
    const ordered = orderTimelineRefs(
      [
        'refs/heads/a',
        'refs/heads/c',
        'refs/heads/main',
        'refs/heads/b',
        'refs/heads/gone',
        'refs/tags/v1',
      ],
      refs,
      activity,
      'main',
    )
    expect(ordered.map((r) => r.name)).toEqual(['main', 'b', 'c', 'a'])
    expect(ordered[0]).toEqual({
      fullName: 'refs/heads/main',
      name: 'main',
      sha: 'main'.padEnd(40, '0'),
      type: 'branch',
    })
  })
})

describe('isStale', () => {
  const options = { base: 'main', head: 'mine', now: NOW }
  it('is stale after a month without commits, except main and the checked-out branch', () => {
    const activity = {
      'refs/heads/old': NOW - 31 * DAY,
      'refs/heads/new': NOW - 29 * DAY,
      'refs/heads/main': NOW - 100 * DAY,
      'refs/heads/mine': NOW - 100 * DAY,
    }
    expect(isStale({ fullName: 'refs/heads/old' }, activity, options)).toBe(true)
    expect(isStale({ fullName: 'refs/heads/new' }, activity, options)).toBe(false)
    expect(isStale({ fullName: 'refs/heads/main' }, activity, options)).toBe(false)
    expect(isStale({ fullName: 'refs/heads/mine' }, activity, options)).toBe(false)
    expect(isStale({ fullName: 'refs/heads/unknown' }, activity, options)).toBe(false)
  })
})
