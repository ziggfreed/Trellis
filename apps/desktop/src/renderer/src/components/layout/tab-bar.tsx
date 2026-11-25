/**
 * The row of repository tabs across the top of the window.
 * - Click to select, middle-click or the X to close.
 * - Keyboard: the tabs form an ARIA tab list. Left/Right (and Home/End) move
 *   between tabs; Delete closes the focused one. Only the active tab is in
 *   the Tab order ("roving tabindex").
 * - Drag a tab to reorder it (native HTML drag and drop).
 * - The logo button on the left goes to the home screen; "+" opens a menu to
 *   open, clone or create a repository.
 */
import { useRef, useState } from 'react'
import { Download, FolderGit2, FolderOpen, FolderPlus, Layers, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TrellisLogo } from '@/components/trellis-logo'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRepos } from '@/features/repos/use-repos'
import { repoActions } from '@/features/repos/repo-actions'
import { saveTabsAsWorkspace } from '@/features/workspaces/workspace-actions'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'

export function TabBar() {
  const { openTabs, activeTab, activate, close, move } = useRepos()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const tabRefs = useRef(new Map<string, HTMLDivElement>())

  /** Arrow keys move to (and open) the neighbouring tab; Delete closes. */
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const target = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: openTabs.length - 1,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      const tab = openTabs[(target + openTabs.length) % openTabs.length]
      if (!tab) return
      activate(tab.path)
      tabRefs.current.get(tab.path)?.focus()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(openTabs[index]!.path)
    } else if (event.key === 'Delete') {
      event.preventDefault()
      close(openTabs[index]!.path)
    }
  }

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b bg-sidebar">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Home"
            onClick={() => activate(null)}
            className={cn(
              'flex w-11 items-center justify-center border-r hover:bg-sidebar-accent',
              activeTab === null && 'bg-background',
            )}
          >
            <TrellisLogo className="size-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Home</TooltipContent>
      </Tooltip>

      <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
        <div role="tablist" aria-label="Open repositories" className="flex items-stretch">
          {openTabs.map((tab, index) => {
            const active = tab.path === activeTab
            return (
              <div
                key={tab.path}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.path, el)
                  else tabRefs.current.delete(tab.path)
                }}
                role="tab"
                aria-selected={active}
                // The active tab (or the first, on the home screen) is reachable with Tab.
                tabIndex={active || (activeTab === null && index === 0) ? 0 : -1}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                title={tab.path}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) move(dragIndex, index)
                  setDragIndex(null)
                }}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => activate(tab.path)}
                onAuxClick={(e) => e.button === 1 && close(tab.path)}
                className={cn(
                  'group relative flex max-w-56 min-w-32 cursor-default items-center gap-2 border-r px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  active
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent',
                  dragIndex === index && 'opacity-50',
                )}
              >
                {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
                <FolderGit2 className="size-4 shrink-0" />
                <span className="truncate">{tab.name}</span>
                {/* A mouse shortcut, deliberately not a <button>: a control inside
                    a tab confuses screen readers. Keyboard users press Delete
                    (or Ctrl/Cmd+W) instead. */}
                <span
                  aria-hidden="true"
                  title={`Close ${tab.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    close(tab.path)
                  }}
                  className={cn(
                    'ml-auto rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent',
                    active && 'opacity-60',
                  )}
                >
                  <X className="size-3.5" />
                </span>
              </div>
            )
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add repository"
              className="m-1 text-muted-foreground"
            >
              <Plus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={repoActions.open}>
              <FolderOpen />
              Open repository…
              <DropdownMenuShortcut>{shortcutLabel('repo.open')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={repoActions.clone}>
              <Download />
              Clone repository…
              <DropdownMenuShortcut>{shortcutLabel('repo.clone')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={repoActions.create}>
              <FolderPlus />
              New repository…
              <DropdownMenuShortcut>{shortcutLabel('repo.new')}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void saveTabsAsWorkspace()}>
              <Layers />
              Save tabs as workspace…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
