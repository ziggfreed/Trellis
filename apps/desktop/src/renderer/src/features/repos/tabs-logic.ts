/**
 * Pure functions for managing repository tabs and the recent-repos list.
 *
 * Each function takes the current state and returns a NEW state (it never
 * modifies its input). Keeping this logic free of React and IPC makes it easy
 * to unit test; see tabs-logic.test.ts.
 */
import type { RepoTab } from '@shared/ipc'

export interface TabsState {
  openTabs: RepoTab[]
  /** Path of the active tab, or null when the home screen is showing. */
  activeTab: string | null
  recentRepos: RepoTab[]
}

export const MAX_RECENT_REPOS = 10

/** Add `repo` to the front of the recent list, removing any older entry for it. */
function touchRecent(recent: RepoTab[], repo: RepoTab): RepoTab[] {
  return [repo, ...recent.filter((r) => r.path !== repo.path)].slice(0, MAX_RECENT_REPOS)
}

/**
 * Open a repository. If it already has a tab, that tab is selected. Otherwise a
 * new tab is inserted just after the active tab (like browsers do) and selected.
 */
export function openTab(state: TabsState, repo: RepoTab): TabsState {
  const recentRepos = touchRecent(state.recentRepos, repo)
  if (state.openTabs.some((t) => t.path === repo.path)) {
    return { ...state, activeTab: repo.path, recentRepos }
  }
  const activeIndex = state.openTabs.findIndex((t) => t.path === state.activeTab)
  const insertAt = activeIndex === -1 ? state.openTabs.length : activeIndex + 1
  const openTabs = [...state.openTabs]
  openTabs.splice(insertAt, 0, repo)
  return { openTabs, activeTab: repo.path, recentRepos }
}

/**
 * Close a tab. If it was active, select the tab to its right, or to its left if
 * it was the last one, or the home screen if no tabs remain.
 */
export function closeTab(state: TabsState, path: string): TabsState {
  const index = state.openTabs.findIndex((t) => t.path === path)
  if (index === -1) return state
  const openTabs = state.openTabs.filter((t) => t.path !== path)
  let activeTab = state.activeTab
  if (activeTab === path) {
    const neighbour = openTabs[index] ?? openTabs[index - 1]
    activeTab = neighbour?.path ?? null
  }
  return { ...state, openTabs, activeTab }
}

/** Select a tab, or pass null to show the home screen. Unknown paths are ignored. */
export function activateTab(state: TabsState, path: string | null): TabsState {
  if (path !== null && !state.openTabs.some((t) => t.path === path)) return state
  return { ...state, activeTab: path }
}

/** Move the tab at `from` to position `to` (used for drag-to-reorder). */
export function moveTab(state: TabsState, from: number, to: number): TabsState {
  const tab = state.openTabs[from]
  if (!tab || to < 0 || to >= state.openTabs.length) return state
  const openTabs = [...state.openTabs]
  openTabs.splice(from, 1)
  openTabs.splice(to, 0, tab)
  return { ...state, openTabs }
}

/** Select the next (+1) or previous (-1) tab, wrapping around. */
export function cycleTab(state: TabsState, direction: 1 | -1): TabsState {
  const count = state.openTabs.length
  if (count === 0) return state
  const current = state.openTabs.findIndex((t) => t.path === state.activeTab)
  // From the home screen (-1), "next" goes to the first tab and "previous" to the last.
  const start = current === -1 ? (direction === 1 ? -1 : 0) : current
  const next = (start + direction + count) % count
  return { ...state, activeTab: state.openTabs[next]!.path }
}

/** Remove a repository from the recent list (e.g. because it was deleted). */
export function removeRecent(state: TabsState, path: string): TabsState {
  return { ...state, recentRepos: state.recentRepos.filter((r) => r.path !== path) }
}
