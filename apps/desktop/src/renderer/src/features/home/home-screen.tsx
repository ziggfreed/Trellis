/** Shown when no repository tab is selected: open a repo or pick a recent one. */
import { FolderGit2, FolderOpen, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TrellisLogo } from '@/components/trellis-logo'
import { openRepoAtPath, pickAndOpenRepo, useRepos } from '@/features/repos/use-repos'

export function HomeScreen() {
  const { recentRepos, removeRecent } = useRepos()

  const handleOpen = async (promise: Promise<Awaited<ReturnType<typeof pickAndOpenRepo>>>) => {
    const result = await promise
    if (result.ok === false) toast.error(result.message)
  }

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <TrellisLogo className="size-14" />
          <h1 className="text-2xl font-semibold">Welcome to Trellis</h1>
          <p className="text-sm text-muted-foreground">
            Open a git repository to get started. Each repository opens in its own tab.
          </p>
          <Button onClick={() => void handleOpen(pickAndOpenRepo())} className="mt-2">
            <FolderOpen />
            Open repository
          </Button>
        </div>

        {recentRepos.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Recent
            </h2>
            <ul className="divide-y rounded-lg border" data-testid="recent-repos">
              {recentRepos.map((repo) => (
                <li key={repo.path} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => void handleOpen(openRepoAtPath(repo.path))}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                  >
                    <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{repo.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {repo.path}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${repo.name} from recent`}
                    className="mr-1 opacity-0 group-hover:opacity-100"
                    onClick={() => removeRecent(repo.path)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
