import { describe, expect, it } from 'vitest'
import type { RepoTab } from '@shared/ipc'
import {
  activateTab,
  closeTab,
  cycleTab,
  MAX_RECENT_REPOS,
  moveTab,
  openTab,
  removeRecent,
  type TabsState,
} from './tabs-logic'

const repo = (name: string): RepoTab => ({ path: `/repos/${name}`, name })
const empty: TabsState = { openTabs: [], activeTab: null, recentRepos: [] }
const names = (s: TabsState) => s.openTabs.map((t) => t.name)

/** State with tabs a, b, c open and `active` selected. */
function withTabs(active: string | null = 'a'): TabsState {
  const openTabs = [repo('a'), repo('b'), repo('c')]
  return { openTabs, activeTab: active && `/repos/${active}`, recentRepos: [] }
}

describe('openTab', () => {
  it('adds and selects a new tab', () => {
    const s = openTab(empty, repo('a'))
    expect(names(s)).toEqual(['a'])
    expect(s.activeTab).toBe('/repos/a')
  })

  it('inserts the new tab after the active tab', () => {
    const s = openTab(withTabs('a'), repo('d'))
    expect(names(s)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('selects an existing tab instead of duplicating it', () => {
    const s = openTab(withTabs('a'), repo('c'))
    expect(names(s)).toEqual(['a', 'b', 'c'])
    expect(s.activeTab).toBe('/repos/c')
  })

  it('moves the repo to the front of the recent list without duplicates', () => {
    let s = openTab(empty, repo('a'))
    s = openTab(s, repo('b'))
    s = openTab(s, repo('a'))
    expect(s.recentRepos.map((r) => r.name)).toEqual(['a', 'b'])
  })

  it('caps the recent list', () => {
    let s = empty
    for (let i = 0; i < MAX_RECENT_REPOS + 5; i++) s = openTab(s, repo(`r${i}`))
    expect(s.recentRepos).toHaveLength(MAX_RECENT_REPOS)
  })
})

describe('closeTab', () => {
  it('selects the tab to the right when closing the active tab', () => {
    expect(closeTab(withTabs('b'), '/repos/b').activeTab).toBe('/repos/c')
  })

  it('selects the tab to the left when closing the last tab', () => {
    expect(closeTab(withTabs('c'), '/repos/c').activeTab).toBe('/repos/b')
  })

  it('keeps the selection when closing another tab', () => {
    expect(closeTab(withTabs('a'), '/repos/c').activeTab).toBe('/repos/a')
  })

  it('shows the home screen when the final tab closes', () => {
    const s = closeTab(openTab(empty, repo('a')), '/repos/a')
    expect(s).toMatchObject({ openTabs: [], activeTab: null })
  })

  it('ignores unknown tabs', () => {
    const s = withTabs()
    expect(closeTab(s, '/nope')).toBe(s)
  })
})

describe('activateTab', () => {
  it('selects a tab or the home screen', () => {
    expect(activateTab(withTabs('a'), '/repos/b').activeTab).toBe('/repos/b')
    expect(activateTab(withTabs('a'), null).activeTab).toBeNull()
  })

  it('ignores unknown tabs', () => {
    expect(activateTab(withTabs('a'), '/nope').activeTab).toBe('/repos/a')
  })
})

describe('moveTab', () => {
  it('reorders tabs', () => {
    expect(names(moveTab(withTabs(), 0, 2))).toEqual(['b', 'c', 'a'])
    expect(names(moveTab(withTabs(), 2, 0))).toEqual(['c', 'a', 'b'])
  })

  it('ignores out-of-range positions', () => {
    const s = withTabs()
    expect(moveTab(s, 0, 5)).toBe(s)
    expect(moveTab(s, 7, 0)).toBe(s)
  })
})

describe('cycleTab', () => {
  it('moves forward and wraps around', () => {
    expect(cycleTab(withTabs('b'), 1).activeTab).toBe('/repos/c')
    expect(cycleTab(withTabs('c'), 1).activeTab).toBe('/repos/a')
  })

  it('moves backward and wraps around', () => {
    expect(cycleTab(withTabs('a'), -1).activeTab).toBe('/repos/c')
  })

  it('starts from the ends when on the home screen', () => {
    expect(cycleTab(withTabs(null), 1).activeTab).toBe('/repos/a')
    expect(cycleTab(withTabs(null), -1).activeTab).toBe('/repos/c')
  })
})

describe('removeRecent', () => {
  it('removes a repo from the recent list', () => {
    const s = openTab(openTab(empty, repo('a')), repo('b'))
    expect(removeRecent(s, '/repos/a').recentRepos.map((r) => r.name)).toEqual(['b'])
  })
})
