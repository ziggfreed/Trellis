/**
 * The row of repository tabs across the top of the window.
 * - Click to select, middle-click or the X to close.
 * - Drag a tab to reorder it (native HTML drag and drop).
 * - The logo button on the left goes to the home screen; "+" opens a repo.
 */
import { useState } from 'react'
import { FolderGit2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TrellisLogo } from '@/components/trellis-logo'
import { cn } from '@/lib/utils'
import { pickAndOpenRepo, useRepos } from '@/features/repos/use-repos'

export function TabBar() {
  const { openTabs, activeTab, activate, close, move } = useRepos()
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b bg-sidebar" role="tablist">
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
        {openTabs.map((tab, index) => {
          const active = tab.path === activeTab
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={active}
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
                'group relative flex max-w-56 min-w-32 cursor-default items-center gap-2 border-r px-3 text-sm',
                active
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent',
                dragIndex === index && 'opacity-50',
              )}
            >
              {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
              <FolderGit2 className="size-4 shrink-0" />
              <span className="truncate">{tab.name}</span>
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
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
              </button>
            </div>
          )
        })}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open repository"
              className="m-1 text-muted-foreground"
              onClick={() =>
                void pickAndOpenRepo().then((r) => r.ok === false && toast.error(r.message))
              }
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open repository (Ctrl+O)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
