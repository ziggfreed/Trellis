/**
 * The list of changed files in the working tree, grouped into conflicts,
 * staged and unstaged changes. Clicking a file shows its diff.
 *
 * Staging, unstaging and committing arrive in Phase 3; for now this view is
 * read-only.
 */
import type { DiffTarget } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { groupChanges, type ChangeEntry } from './group-changes'

/** The diff to show for a change entry. */
function targetFor(entry: ChangeEntry): DiffTarget {
  return entry.area === 'staged'
    ? { kind: 'staged', path: entry.path, ...(entry.origPath ? { oldPath: entry.origPath } : {}) }
    : { kind: 'unstaged', path: entry.path }
}

export function ChangesList({ repoPath }: { repoPath: string }) {
  const { data, error } = useStatus(repoPath)
  const [view, setView] = useRepoView(repoPath)

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null

  const groups = groupChanges(data.files)
  const sections = [
    { title: 'Conflicts', entries: groups.conflicted },
    { title: 'Staged', entries: groups.staged },
    { title: 'Unstaged', entries: groups.unstaged },
  ].filter((s) => s.entries.length > 0)

  if (sections.length === 0) {
    return (
      <p className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        No changes. Your working tree is clean.
      </p>
    )
  }

  const selected = view.selectedFile
  const isSelected = (entry: ChangeEntry) =>
    selected?.kind !== 'commit' &&
    selected?.path === entry.path &&
    selected.kind === (entry.area === 'staged' ? 'staged' : 'unstaged')

  return (
    <div className="h-full overflow-y-auto py-1" data-testid="changes-list">
      {sections.map((section) => (
        <section key={section.title} className="mb-2">
          <h3 className="px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title} ({section.entries.length})
          </h3>
          <ul>
            {section.entries.map((entry) => (
              <li key={`${entry.area}:${entry.path}`}>
                <button
                  type="button"
                  onClick={() => setView({ selectedFile: targetFor(entry) })}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1 text-left text-sm',
                    isSelected(entry) ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <ChangeBadge change={entry.change} />
                  <FilePath path={entry.path} oldPath={entry.origPath} className="flex-1" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
