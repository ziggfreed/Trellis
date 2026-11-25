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
 * All panels can be resized by dragging the dividers; their sizes are kept
 * between launches (features/layout/panel-layout.ts).
 */
import {
  Code,
  FilePen,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  GitCompare,
  SquareTerminal,
} from 'lucide-react'
import type { RepoTab } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useStatus } from '@/features/repos/use-repo-data'
import { RepoSidebar } from '@/features/sidebar/repo-sidebar'
import { HistoryPanel } from '@/features/history/history-panel'
import { CommitDetails } from '@/features/history/commit-details'
import { ChangesList } from '@/features/changes/changes-list'
import { CommitBox } from '@/features/changes/commit-box'
import { PatchView } from '@/features/changes/patch-view'
import { DiffPanel } from '@/features/diff/diff-panel'
import { useRepoView } from './repo-view-store'
import { usePanelLayout } from '@/features/layout/panel-layout'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openInEditor, openInTerminal } from '@/features/repo-actions/open-external'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'
import { FileView } from '@/features/file-view/file-view'
import { CompareView } from '@/features/compare/compare-view'
import { RepoToolbar } from '@/features/repo-toolbar/repo-toolbar'
import { OperationBanner } from '@/features/repo-toolbar/operation-banner'
import { BisectBanner } from '@/features/bisect/bisect'

export function RepoView({ repo }: { repo: RepoTab }) {
  const [view, setView] = useRepoView(repo.path)
  const changeCount = useStatus(repo.path).data?.files.length ?? 0
  const outerLayout = usePanelLayout('repo-layout', ['sidebar', 'main'])

  return (
    <ResizablePanelGroup orientation="horizontal" {...outerLayout}>
      <ResizablePanel
        id="sidebar"
        defaultSize="18%"
        minSize="10%"
        maxSize="40%"
        className="bg-sidebar"
      >
        <RepoSidebar repoPath={repo.path} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="main" minSize="40%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
            <div role="tablist" aria-label="Views" className="flex items-center gap-1">
              <ViewTab
                active={view.view === 'history'}
                onClick={() => setView({ view: 'history', selectedFile: null })}
                icon={<GitCommitHorizontal />}
              >
                History
              </ViewTab>
              {view.file && (
                <ViewTab
                  active={view.view === 'file'}
                  onClick={() => setView({ view: 'file', selectedFile: null })}
                  icon={<FileText />}
                >
                  <span className="max-w-40 truncate">{view.file.path.split('/').pop()}</span>
                </ViewTab>
              )}
              {view.compare && (
                <ViewTab
                  active={view.view === 'compare'}
                  onClick={() => setView({ view: 'compare', selectedFile: null })}
                  icon={<GitCompare />}
                >
                  Compare
                </ViewTab>
              )}
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
            </div>
            <div className="ml-auto flex items-center gap-1">
              <RepoToolbar repoPath={repo.path} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label="Open in…"
                    title="Open in…"
                  >
                    <FolderOpen />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void openInTerminal(repo.path)}>
                    <SquareTerminal />
                    Open in terminal
                    <DropdownMenuShortcut>{shortcutLabel('terminal')}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void openInEditor(repo.path)}>
                    <Code />
                    Open in editor
                    <DropdownMenuShortcut>{shortcutLabel('editor')}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void api.invoke('repo:showInFolder', repo.path)}
                  >
                    <FolderOpen />
                    Show in folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <OperationBanner repoPath={repo.path} />
          <BisectBanner repoPath={repo.path} />

          <div className="min-h-0 flex-1">
            {view.view === 'file' && view.file ? (
              <FileView repoPath={repo.path} file={view.file} />
            ) : view.view === 'compare' && view.compare ? (
              <CompareView repoPath={repo.path} compare={view.compare} />
            ) : view.view === 'history' ? (
              <HistoryLayout repoPath={repo.path} />
            ) : (
              <ChangesLayout repoPath={repo.path} />
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** History view: commit list on top; commit details and diff below. */
function HistoryLayout({ repoPath }: { repoPath: string }) {
  const [view] = useRepoView(repoPath)
  const outer = usePanelLayout('history-layout', ['list', 'bottom'])
  const bottom = usePanelLayout('history-bottom-layout', ['details', 'diff'])
  return (
    <ResizablePanelGroup orientation="vertical" {...outer}>
      <ResizablePanel id="list" defaultSize="55%" minSize="20%">
        <HistoryPanel repoPath={repoPath} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="bottom" minSize="20%">
        <ResizablePanelGroup orientation="horizontal" {...bottom}>
          <ResizablePanel id="details" defaultSize="40%" minSize="20%">
            <CommitDetails repoPath={repoPath} />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="diff" minSize="30%">
            <DiffPanel repoPath={repoPath} target={view.selectedFile} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** Changes view: changed files and the commit box on the left, the diff on the right. */
function ChangesLayout({ repoPath }: { repoPath: string }) {
  const [view] = useRepoView(repoPath)
  const layout = usePanelLayout('changes-layout', ['files', 'diff'])
  const file = view.selectedFile
  return (
    <ResizablePanelGroup orientation="horizontal" {...layout}>
      <ResizablePanel id="files" defaultSize="35%" minSize="20%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <ChangesList repoPath={repoPath} />
          </div>
          <CommitBox repoPath={repoPath} />
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="diff" minSize="30%">
        {file && (file.kind === 'staged' || file.kind === 'unstaged') ? (
          <PatchView
            key={`${file.kind}:${file.path}`}
            repoPath={repoPath}
            file={file.path}
            area={file.kind}
          />
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to see its changes.
          </p>
        )}
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
