/**
 * Pure functions for managing workspaces (named groups of repositories).
 * Each returns a new list; the caller saves it to settings.
 */
import type { RepoTab, Workspace } from '@shared/ipc'

export function createWorkspace(
  list: readonly Workspace[],
  name: string,
  repos: readonly RepoTab[],
  id: string,
): Workspace[] {
  return [...list, { id, name: name.trim(), repos: dedupe(repos) }]
}

export function renameWorkspace(list: readonly Workspace[], id: string, name: string): Workspace[] {
  return list.map((w) => (w.id === id ? { ...w, name: name.trim() } : w))
}

export function deleteWorkspace(list: readonly Workspace[], id: string): Workspace[] {
  return list.filter((w) => w.id !== id)
}

export function addReposToWorkspace(
  list: readonly Workspace[],
  id: string,
  repos: readonly RepoTab[],
): Workspace[] {
  return list.map((w) => (w.id === id ? { ...w, repos: dedupe([...w.repos, ...repos]) } : w))
}

export function removeRepoFromWorkspace(
  list: readonly Workspace[],
  id: string,
  path: string,
): Workspace[] {
  return list.map((w) =>
    w.id === id ? { ...w, repos: w.repos.filter((r) => r.path !== path) } : w,
  )
}

/** A name for a new workspace that isn't already taken. */
export function validateWorkspaceName(
  list: readonly Workspace[],
  name: string,
  ignoreId?: string,
): string | null {
  if (!name.trim()) return 'Enter a name.'
  if (list.some((w) => w.id !== ignoreId && w.name.toLowerCase() === name.trim().toLowerCase())) {
    return 'A workspace with that name already exists.'
  }
  return null
}

function dedupe(repos: readonly RepoTab[]): RepoTab[] {
  const seen = new Set<string>()
  return repos.filter((r) => !seen.has(r.path) && seen.add(r.path))
}
