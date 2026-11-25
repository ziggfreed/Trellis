import { describe, expect, it } from 'vitest'
import {
  apiEndpoint,
  commitDecorations,
  compareUrl,
  panelItems,
  parseRemote,
  rollupIcon,
  statusText,
} from './lib.js'

/**
 * @param {Partial<import('./lib.js').PullRequest>} overrides
 * @returns {import('./lib.js').PullRequest}
 */
const pr = (overrides) => ({
  number: 1,
  title: 'Add widgets',
  url: 'https://github.com/acme/widgets/pull/1',
  isDraft: false,
  headRefName: 'feature',
  author: { login: 'sam' },
  reviewDecision: null,
  commits: {
    nodes: [{ commit: { statusCheckRollup: { state: /** @type {const} */ ('SUCCESS') } } }],
  },
  ...overrides,
})

/** @returns {import('./lib.js').RepoData} */
const data = (/** @type {any[]} */ pulls) => ({
  url: 'https://github.com/acme/widgets',
  defaultBranchRef: { name: 'main' },
  pullRequests: { nodes: pulls },
  ref: {
    target: {
      history: {
        nodes: [
          {
            oid: 'a1',
            url: 'https://github.com/acme/widgets/commit/a1',
            statusCheckRollup: { state: 'FAILURE' },
          },
          { oid: 'b2', url: 'https://github.com/acme/widgets/commit/b2', statusCheckRollup: null },
        ],
      },
    },
  },
})

describe('remotes', () => {
  it('reads owner and name from GitHub remotes', () => {
    expect(parseRemote('git@github.com:acme/widgets.git', 'github.com')).toEqual({
      owner: 'acme',
      name: 'widgets',
    })
    expect(parseRemote('https://github.com/acme/widgets\n', 'github.com')).toEqual({
      owner: 'acme',
      name: 'widgets',
    })
    expect(parseRemote('ssh://git@github.com:22/acme/widgets.git', 'github.com')?.name).toBe(
      'widgets',
    )
  })

  it('rejects other hosts and odd paths', () => {
    expect(parseRemote('git@gitlab.com:acme/widgets.git', 'github.com')).toBeNull()
    expect(parseRemote('https://github.com/acme/group/widgets', 'github.com')).toBeNull()
    expect(parseRemote('/local/folder', 'github.com')).toBeNull()
  })

  it('uses the enterprise host when an API address is set', () => {
    expect(apiEndpoint('')).toEqual({
      graphql: 'https://api.github.com/graphql',
      host: 'github.com',
    })
    expect(apiEndpoint('https://GHE.example.com/api/graphql').host).toBe('ghe.example.com')
  })
})

describe('turning GitHub data into UI', () => {
  it('puts this branch’s pull request first', () => {
    const items = panelItems(data([pr({ number: 2, headRefName: 'other' }), pr({})]), 'feature')
    expect(items.map((i) => i.label)).toEqual(['#1 Add widgets', '#2 Add widgets'])
    expect(items[0]).toMatchObject({ description: 'this branch', icon: 'success' })
  })

  it('offers to create a pull request for a branch without one', () => {
    expect(panelItems(data([]), 'feature')[0]?.command).toBe('github.createPullRequest')
    expect(panelItems(data([]), 'main')).toEqual([])
  })

  it('badges commits that have checks', () => {
    expect(commitDecorations(data([]))).toEqual([
      {
        sha: 'a1',
        icon: 'failure',
        tooltip: 'Checks failed (GitHub). Click to see them.',
        url: 'https://github.com/acme/widgets/commit/a1/checks',
      },
    ])
  })

  it('maps check states and status text', () => {
    expect(rollupIcon('PENDING')).toBe('pending')
    expect(rollupIcon(null)).toBe('neutral')
    expect(statusText(pr({ number: 7 }))).toBe('✓ PR #7')
    expect(statusText(null)).toBe('')
  })

  it('builds the compare page link', () => {
    expect(compareUrl('https://github.com/acme/widgets', 'sam/new thing')).toBe(
      'https://github.com/acme/widgets/compare/sam/new%20thing?expand=1',
    )
  })
})
