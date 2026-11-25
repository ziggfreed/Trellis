/**
 * Favourite (starred) repositories, shown at the top of the home screen.
 * Pure functions; the caller saves the result to settings.
 */
import type { RepoTab } from '@shared/ipc'

export function isFavourite(list: readonly RepoTab[], path: string): boolean {
  return list.some((r) => r.path === path)
}

/** Star `repo` if it isn't starred, otherwise unstar it. New stars go at the end. */
export function toggleFavourite(list: readonly RepoTab[], repo: RepoTab): RepoTab[] {
  return isFavourite(list, repo.path)
    ? list.filter((r) => r.path !== repo.path)
    : [...list, { path: repo.path, name: repo.name }]
}
