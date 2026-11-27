/**
 * The top half of the History view: toolbar (branches, search, filter) and
 * either the commit list or the timeline (switched in the toolbar). Runs the
 * search/filter and shares the results with both.
 */
import { useMemo } from 'react'
import { useCommitSearch } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { CommitList } from './commit-list'
import { HistoryToolbar } from './history-toolbar'
import { buildCommitFilter } from './history-filter'
import { useSettingsStore } from '@/features/settings/settings-store'
import { TimelineView } from '@/features/timeline/timeline-view'

export function HistoryPanel({ repoPath }: { repoPath: string }) {
  const [view] = useRepoView(repoPath)
  const timeline = useSettingsStore((s) => s.settings.historyView) === 'timeline'
  // Wait for typing to pause before asking git.
  const wanted = useMemo(
    () => buildCommitFilter(view.search, view.filter),
    [view.search, view.filter],
  )
  const filter = useDebouncedValue(wanted, 250)
  const order = useSettingsStore((s) => s.settings.historyOrder)
  const search = useCommitSearch(repoPath, filter, view.scope, order)

  // Highlight results only while a search is still wanted (clearing it is instant).
  const active = wanted !== null && filter !== null && search.data !== undefined
  const matches = active ? search.data! : null
  const matchSet = useMemo(() => (matches ? new Set(matches) : null), [matches])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <HistoryToolbar repoPath={repoPath} matches={matches} />
      <div className="min-h-0 flex-1">
        {timeline ? (
          <TimelineView repoPath={repoPath} matches={matchSet} />
        ) : (
          <CommitList repoPath={repoPath} matches={matchSet} />
        )}
      </div>
    </div>
  )
}
