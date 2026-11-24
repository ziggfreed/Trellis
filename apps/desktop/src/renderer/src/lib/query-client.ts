/**
 * TanStack Query setup. Query caches data from the main process (status,
 * history, branches...) and refetches it when told it's stale.
 *
 * Query keys always start with ['repo', repoPath, ...], so all data for one
 * repository can be refreshed at once with `invalidateRepo(path)`.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh until the file watcher says otherwise.
      staleTime: Infinity,
      // ...but refresh when the window regains focus, in case a change was
      // missed (watching can fail for very large folders).
      refetchOnWindowFocus: true,
      retry: false,
    },
  },
})

/** Query keys for repository data. */
export const repoKeys = {
  all: (path: string) => ['repo', path] as const,
  status: (path: string) => ['repo', path, 'status'] as const,
  log: (path: string) => ['repo', path, 'log'] as const,
  refs: (path: string) => ['repo', path, 'refs'] as const,
  remotes: (path: string) => ['repo', path, 'remotes'] as const,
  stashes: (path: string) => ['repo', path, 'stashes'] as const,
  commit: (path: string, sha: string) => ['repo', path, 'commit', sha] as const,
  fileDiff: (path: string, target: unknown) => ['repo', path, 'diff', target] as const,
  // Under 'diff' so it refreshes whenever working-tree files change.
  filePatch: (path: string, file: string, area: string) =>
    ['repo', path, 'diff', 'patch', area, file] as const,
}
