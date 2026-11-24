/**
 * The main view for one open repository:
 *
 *   ┌──────────┬───────────────────────────────────────┐
 *   │          │ [History] [Changes (3)]               │
 *   │ sidebar  ├───────────────────────────────────────┤
 *   │ branches │ commit list        (or changed files) │
 *   │ remotes  ├─────────────────┬─────────────────────┤
 *   │ tags     │ commit details  │ diff                │
 *   │ stashes  │                 │                     │
 *   └──────────┴─────────────────┴─────────────────────┘
 *
 * In the Changes view the file list and diff sit side by side.
 * All panels can be resized by dragging the dividers.
 */
import { FolderOpen, GitCommitHorizontal, FilePen } from 'lucide-react'
import type { RepoTab } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useStatus } from '@/features/repos/use-repo-data'
import { RepoSidebar } from '@/features/sidebar/repo-sidebar'
import { CommitList } from '@/features/history/commit-list'
import { CommitDetails } from '@/features/history/commit-details'
import { ChangesList } from '@/features/changes/changes-list'
import { DiffPanel } from '@/features/diff/diff-panel'
import { useRepoView } from './repo-view-store'

export function RepoView({ repo }: { repo: RepoTab }) {
  const [view, setView] = useRepoView(repo.path)
  const changeCount = useStatus(repo.path).data?.files.length ?? 0

  return (
    <ResizablePanelGroup orientation="horizontal" id="repo-layout">
      <ResizablePanel defaultSize="18%" minSize="10%" maxSize="40%" className="bg-sidebar">
        <RepoSidebar repoPath={repo.path} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel minSize="40%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
            <ViewTab
              active={view.view === 'history'}
              onClick={() => setView({ view: 'history', selectedFile: null })}
              icon={<GitCommitHorizontal />}
            >
              History
            </ViewTab>
            <ViewTab
              active={view.view === 'changes'}
              onClick={() => setView({ view: 'changes', selectedFile: null })}
              icon={<FilePen />}
            >
              Changes
              {changeCount > 0 && (
                <span className="rounded bg-brand/20 px-1.5 text-xs" data-testid="change-count">
                  {changeCount}
                </span>
              )}
            </ViewTab>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              title={repo.path}
              onClick={() => void api.invoke('repo:showInFolder', repo.path)}
            >
              <FolderOpen />
              Show in folder
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            {view.view === 'history' ? (
              <ResizablePanelGroup orientation="vertical" id="history-layout">
                <ResizablePanel defaultSize="55%" minSize="20%">
                  <CommitList repoPath={repo.path} />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel minSize="20%">
                  <ResizablePanelGroup orientation="horizontal" id="history-bottom-layout">
                    <ResizablePanel defaultSize="40%" minSize="20%">
                      <CommitDetails repoPath={repo.path} />
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel minSize="30%">
                      <DiffPanel repoPath={repo.path} target={view.selectedFile} />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <ResizablePanelGroup orientation="horizontal" id="changes-layout">
                <ResizablePanel defaultSize="35%" minSize="20%">
                  <ChangesList repoPath={repo.path} />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel minSize="30%">
                  <DiffPanel repoPath={repo.path} target={view.selectedFile} />
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function ViewTab(props: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      onClick={props.onClick}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm [&_svg]:size-4',
        props.active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {props.icon}
      {props.children}
    </button>
  )
}
