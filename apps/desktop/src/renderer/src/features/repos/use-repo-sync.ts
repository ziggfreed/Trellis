/**
 * Keeps cached repository data in sync with the files on disk.
 *
 * - Tells the main process which repositories to watch (the open tabs).
 * - When main reports a change, marks that repo's cached data as stale so
 *   TanStack Query refetches whatever is on screen.
 *
 * Mount this once, near the top of the app.
 */
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { queryClient, repoKeys } from '@/lib/query-client'
import { useRepos } from './use-repos'

export function useRepoSync() {
  const { openTabs } = useRepos()
  const paths = openTabs.map((t) => t.path).join('\n')

  useEffect(() => {
    void api.invoke('repo:setWatched', paths ? paths.split('\n') : [])
  }, [paths])

  useEffect(
    () =>
      api.on('repo:changed', ({ path, scope }) => {
        if (scope === 'status') {
          void queryClient.invalidateQueries({ queryKey: repoKeys.status(path) })
          // Working-tree diffs may have changed too.
          void queryClient.invalidateQueries({ queryKey: [...repoKeys.all(path), 'diff'] })
        } else {
          void queryClient.invalidateQueries({ queryKey: repoKeys.all(path) })
        }
      }),
    [],
  )
}
