/**
 * The top half of the History view: toolbar (branch filter + search) and
 * the commit list. Runs the search and shares the results with both.
 */
import { useMemo } from 'react'
import { useCommitSearch } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { CommitList } from './commit-list'
import { HistoryToolbar } from './history-toolbar'

export function HistoryPanel({ repoPath }: { repoPath: string }) {
  const [view] = useRepoView(repoPath)
  const query = useDebouncedValue(view.search.trim(), 250)
  const search = useCommitSearch(repoPath, query, view.scope)

  const active = view.search.trim() !== '' && query !== '' && search.data !== undefined
  const matches = active ? search.data! : null
  const matchSet = useMemo(() => (matches ? new Set(matches) : null), [matches])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <HistoryToolbar repoPath={repoPath} matches={matches} />
      <div className="min-h-0 flex-1">
        <CommitList repoPath={repoPath} matches={matchSet} />
      </div>
    </div>
  )
}
