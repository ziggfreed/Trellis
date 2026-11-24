/**
 * A table of repositories with their live status (branch, commits to push
 * or pull, uncommitted changes), used on the home screen for each workspace
 * and for recent repositories.
 */
import { useQueries } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, FolderGit2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { RepoTab } from '@shared/ipc'
import { api } from '@/lib/api'
import { repoKeys } from '@/lib/query-client'
import { Button } from '@/components/ui/button'
import { openRepoAtPath } from '@/features/repos/use-repos'

interface RepoDashboardProps {
  title: React.ReactNode
  repos: RepoTab[]
  /** Buttons shown next to the title. */
  actions?: React.ReactNode
  /** If given, each row gets an X button that calls this. */
  onRemove?: (repo: RepoTab) => void
  removeLabel?: string
  testId?: string
}

export function RepoDashboard(props: RepoDashboardProps) {
  // Same query keys as the rest of the app, so open repositories share the cache.
  const statuses = useQueries({
    queries: props.repos.map((repo) => ({
      queryKey: repoKeys.status(repo.path),
      queryFn: () => api.invoke('repo:getStatus', repo.path),
      retry: false,
    })),
  })

  const open = async (repo: RepoTab) => {
    const result = await openRepoAtPath(repo.path)
    if (result.ok === false) toast.error(result.message)
  }

  return (
    <section data-testid={props.testId}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {props.title}
        </h2>
        <div className="ml-auto flex gap-1">{props.actions}</div>
      </div>
      {props.repos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No repositories.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {props.repos.map((repo, i) => {
            const { data: status, error } = statuses[i]!
            const changes = status?.files.length ?? 0
            return (
              <li key={repo.path} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => void open(repo)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                >
                  <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{repo.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {repo.path}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {error ? (
                      <span className="text-destructive">Folder not found</span>
                    ) : status ? (
                      <>
                        <span className="max-w-32 truncate">
                          {status.branch.head ?? 'detached'}
                        </span>
                        {status.branch.upstream && (
                          <span
                            className="flex items-center gap-1 tabular-nums"
                            title={`Compared with ${status.branch.upstream}`}
                          >
                            <ArrowUp className="size-3" />
                            {status.branch.ahead}
                            <ArrowDown className="size-3" />
                            {status.branch.behind}
                          </span>
                        )}
                        <span className={changes ? 'text-change-modified' : ''}>
                          {changes ? `${changes} changed` : 'clean'}
                        </span>
                      </>
                    ) : null}
                  </span>
                </button>
                {props.onRemove && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${props.removeLabel ?? 'Remove'} ${repo.name}`}
                    className="mr-1 opacity-0 group-hover:opacity-100"
                    onClick={() => props.onRemove!(repo)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
