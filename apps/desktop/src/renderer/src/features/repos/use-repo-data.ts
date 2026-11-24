/**
 * React hooks that load repository data from the main process.
 * Each hook wraps one IPC call in a TanStack Query, so data is cached per
 * repository and refreshed automatically when files change.
 */
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { DiffTarget, LogScope } from '@shared/ipc'
import { api } from '@/lib/api'
import { repoKeys } from '@/lib/query-client'

/** How many commits to load at a time in the history list. */
export const LOG_PAGE_SIZE = 500

export function useStatus(path: string) {
  return useQuery({
    queryKey: repoKeys.status(path),
    queryFn: () => api.invoke('repo:getStatus', path),
  })
}

export function useRefs(path: string) {
  return useQuery({
    queryKey: repoKeys.refs(path),
    queryFn: () => api.invoke('repo:getRefs', path),
  })
}

export function useRemotes(path: string) {
  return useQuery({
    queryKey: repoKeys.remotes(path),
    queryFn: () => api.invoke('repo:getRemotes', path),
  })
}

export function useStashes(path: string) {
  return useQuery({
    queryKey: repoKeys.stashes(path),
    queryFn: () => api.invoke('repo:getStashes', path),
  })
}

/** Commit history, loaded one page at a time as the user scrolls. */
export function useLog(path: string, scope: LogScope) {
  return useInfiniteQuery({
    queryKey: [...repoKeys.log(path), scope],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.invoke('repo:getLog', path, { skip: pageParam, limit: LOG_PAGE_SIZE, scope }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * LOG_PAGE_SIZE : undefined,
  })
}

export function useCommitDetails(path: string, sha: string | null) {
  return useQuery({
    queryKey: repoKeys.commit(path, sha ?? ''),
    queryFn: () => api.invoke('repo:getCommit', path, sha!),
    enabled: sha !== null,
    // A commit never changes, so keep showing the previous one while the next loads.
    placeholderData: keepPreviousData,
  })
}

export function useFileDiff(path: string, target: DiffTarget | null) {
  return useQuery({
    queryKey: repoKeys.fileDiff(path, target),
    queryFn: () => api.invoke('repo:getFileDiff', path, target!),
    enabled: target !== null,
  })
}

/** Hashes of commits matching a search, newest first (empty when `query` is blank). */
export function useCommitSearch(path: string, query: string, scope: LogScope) {
  const text = query.trim()
  return useQuery({
    queryKey: [...repoKeys.all(path), 'search', scope, text],
    queryFn: () => api.invoke('repo:searchCommits', path, text, scope),
    enabled: text !== '',
    placeholderData: keepPreviousData,
  })
}

/** What can be undone or redone right now (labels shown on the Undo/Redo buttons). */
export function useUndoState(path: string) {
  return useQuery({
    queryKey: [...repoKeys.all(path), 'undo'],
    queryFn: () => api.invoke('repo:getUndoState', path),
  })
}
