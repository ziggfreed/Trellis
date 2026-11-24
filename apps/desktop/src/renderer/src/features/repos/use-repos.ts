/**
 * React hook that exposes the open tabs plus actions to change them.
 * The state lives in the settings store (so it's saved), and the changes are
 * computed by the pure functions in tabs-logic.ts.
 */
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { RepoTab } from '@shared/ipc'
import { api } from '@/lib/api'
import { useSettingsStore } from '@/features/settings/settings-store'
import * as tabs from './tabs-logic'

/** Apply a tabs-logic function to the current settings and save the result. */
function applyTabs<A extends unknown[]>(
  fn: (s: tabs.TabsState, ...args: A) => tabs.TabsState,
  ...args: A
) {
  const { settings, update } = useSettingsStore.getState()
  const { openTabs, activeTab, recentRepos } = fn(settings, ...args)
  update({ openTabs, activeTab, recentRepos })
}

export type OpenRepoOutcome = { ok: true } | { ok: false; message: string } | { ok: 'cancelled' }

/** Validate a folder and open it as a tab. */
export async function openRepoAtPath(path: string): Promise<OpenRepoOutcome> {
  const result = await api.invoke('repo:resolve', path)
  if (!result.ok) {
    const message =
      result.reason === 'not-found'
        ? `The folder ${result.path} no longer exists.`
        : `${result.path} is not a git repository.`
    return { ok: false, message }
  }
  applyTabs(tabs.openTab, result.repo)
  return { ok: true }
}

/** Open (or switch to) a tab for a repository we already know is valid. */
export function openRepoTab(repo: RepoTab): void {
  applyTabs(tabs.openTab, repo)
}

/** Ask for a folder, create a new repository there, and open it. */
export async function createNewRepo(): Promise<OpenRepoOutcome> {
  const dir = await api.invoke('dialog:pickFolder', {
    title: 'Choose a folder for the new repository',
  })
  if (!dir) return { ok: 'cancelled' }
  const result = await api.invoke('repo:init', dir)
  if (!result.ok) return { ok: false, message: result.message }
  openRepoTab(result.repo)
  return { ok: true }
}

/** Show the folder picker, then open the chosen folder. */
export async function pickAndOpenRepo(): Promise<OpenRepoOutcome> {
  const path = await api.invoke('dialog:pickFolder', { title: 'Open repository' })
  if (!path) return { ok: 'cancelled' }
  return openRepoAtPath(path)
}

export function useRepos() {
  const { openTabs, activeTab, recentRepos } = useSettingsStore(
    useShallow((s) => ({
      openTabs: s.settings.openTabs,
      activeTab: s.settings.activeTab,
      recentRepos: s.settings.recentRepos,
    })),
  )

  return {
    openTabs,
    activeTab,
    recentRepos,
    activeRepo: openTabs.find((t) => t.path === activeTab) ?? null,
    activate: useCallback((path: string | null) => applyTabs(tabs.activateTab, path), []),
    close: useCallback((path: string) => applyTabs(tabs.closeTab, path), []),
    move: useCallback((from: number, to: number) => applyTabs(tabs.moveTab, from, to), []),
    cycle: useCallback((direction: 1 | -1) => applyTabs(tabs.cycleTab, direction), []),
    removeRecent: useCallback((path: string) => applyTabs(tabs.removeRecent, path), []),
  }
}
