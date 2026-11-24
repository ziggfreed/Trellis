/**
 * The home screen, shown when no repository tab is selected:
 * - open, clone or create a repository,
 * - workspaces (named groups of repositories) with their live status,
 * - recently opened repositories.
 */
import { Download, FolderOpen, FolderPlus, MoreHorizontal, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TrellisLogo } from '@/components/trellis-logo'
import { useRepos } from '@/features/repos/use-repos'
import { repoActions } from '@/features/repos/repo-actions'
import { useSettingsStore } from '@/features/settings/settings-store'
import * as workspaceActions from '@/features/workspaces/workspace-actions'
import { RepoDashboard } from './repo-dashboard'

export function HomeScreen() {
  const { recentRepos, openTabs, removeRecent } = useRepos()
  const workspaces = useSettingsStore((s) => s.settings.workspaces)

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <TrellisLogo className="size-14" />
          <h1 className="text-2xl font-semibold">Welcome to Trellis</h1>
          <p className="text-sm text-muted-foreground">
            Open a git repository to get started. Each repository opens in its own tab.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={repoActions.open}>
              <FolderOpen />
              Open repository
            </Button>
            <Button variant="outline" onClick={repoActions.clone}>
              <Download />
              Clone
            </Button>
            <Button variant="outline" onClick={repoActions.create}>
              <FolderPlus />
              New
            </Button>
          </div>
        </div>

        {workspaces.map((workspace) => (
          <RepoDashboard
            key={workspace.id}
            testId={`workspace-${workspace.name}`}
            title={workspace.name}
            repos={workspace.repos}
            onRemove={(repo) => workspaceActions.removeFromWorkspace(workspace, repo.path)}
            removeLabel="Remove from workspace"
            actions={
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void workspaceActions.openWorkspace(workspace)}
                >
                  Open all
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    void workspaceActions.fetchRepos(workspace.repos.map((r) => r.path))
                  }
                >
                  <RefreshCw />
                  Fetch all
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`More actions for ${workspace.name}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={openTabs.length === 0}
                      onSelect={() => workspaceActions.addOpenTabsToWorkspace(workspace)}
                    >
                      Add open tabs
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void workspaceActions.renameWorkspace(workspace)}
                    >
                      Rename…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void workspaceActions.deleteWorkspace(workspace)}
                    >
                      Delete workspace…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        ))}

        {recentRepos.length > 0 && (
          <RepoDashboard
            testId="recent-repos"
            title="Recent"
            repos={recentRepos}
            onRemove={(repo) => removeRecent(repo.path)}
            removeLabel="Remove from recent"
            actions={
              <>
                {openTabs.length > 0 && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void workspaceActions.saveTabsAsWorkspace()}
                  >
                    Save open tabs as workspace…
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void workspaceActions.fetchRepos(recentRepos.map((r) => r.path))}
                >
                  <RefreshCw />
                  Fetch all
                </Button>
              </>
            }
          />
        )}
      </div>
    </div>
  )
}
