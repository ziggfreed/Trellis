/**
 * The main view for one open repository.
 *
 * Phase 0 shows the layout (sidebar + content) with placeholders. Upcoming phases
 * fill these in: branches/remotes/tags/stashes in the sidebar (Phase 1), and the
 * commit graph, changes and diff views in the content area (Phases 1-3).
 */
import { FolderOpen, GitBranch, GitFork, Archive, Tag } from 'lucide-react'
import type { RepoTab } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { describeHead, useRepoSummary } from '@/features/repos/use-repo-summary'

const SIDEBAR_SECTIONS = [
  { label: 'Branches', icon: GitBranch },
  { label: 'Remotes', icon: GitFork },
  { label: 'Tags', icon: Tag },
  { label: 'Stashes', icon: Archive },
]

export function RepoView({ repo }: { repo: RepoTab }) {
  const { summary, error } = useRepoSummary(repo.path)
  const head = describeHead(summary)

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 overflow-y-auto border-r bg-sidebar p-2">
        {SIDEBAR_SECTIONS.map(({ label, icon: Icon }) => (
          <div key={label} className="mb-3">
            <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Icon className="size-3.5" />
              {label}
            </div>
            <p className="px-2 text-xs text-muted-foreground/70 italic">Coming soon</p>
          </div>
        ))}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold" data-testid="repo-title">
              {repo.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground select-text">{repo.path}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void api.invoke('repo:showInFolder', repo.path)}
          >
            <FolderOpen />
            Show in folder
          </Button>
        </div>

        {error ? (
          <p className="mt-6 text-sm text-destructive">{error}</p>
        ) : (
          <p className="mt-6 flex items-center gap-2 text-sm">
            <GitBranch className="size-4 text-brand" />
            {head ?? 'Loading…'}
            {summary?.head.kind === 'branch' && summary.head.unborn && (
              <span className="text-muted-foreground">(no commits yet)</span>
            )}
          </p>
        )}

        <div className="mt-10 flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          The commit graph will appear here.
        </div>
      </main>
    </div>
  )
}
