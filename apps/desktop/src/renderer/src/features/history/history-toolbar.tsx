/**
 * Toolbar above the commit list: which branches to show, Compare, and search.
 *
 * Search matches commit messages, authors and hashes. Matching commits are
 * highlighted in the list; ↑/↓ buttons (or Enter / Shift+Enter in the box)
 * jump between them, loading more history if a match is further back.
 */
import { useRef } from 'react'
import { ChevronDown, ChevronUp, GitCompareArrows, Search, X } from 'lucide-react'
import type { LogScope } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'
import { openCompareDialog } from '@/features/compare/compare-dialog'

export const SCOPE_LABELS: Record<LogScope, string> = {
  all: 'All branches',
  local: 'Local branches',
  head: 'Current branch',
}

interface HistoryToolbarProps {
  repoPath: string
  /** Hashes of matching commits, newest first (null while no search is active). */
  matches: string[] | null
}

export function HistoryToolbar({ repoPath, matches }: HistoryToolbarProps) {
  const [view, setView] = useRepoView(repoPath)
  const inputRef = useRef<HTMLInputElement>(null)

  const position = matches && view.selectedSha ? matches.indexOf(view.selectedSha) : -1

  /** Select the next (+1) or previous (-1) match, wrapping around. */
  const jump = (direction: 1 | -1) => {
    if (!matches?.length) return
    const next =
      position === -1
        ? direction === 1
          ? 0
          : matches.length - 1
        : (position + direction + matches.length) % matches.length
    setView({ selectedSha: matches[next]!, seekSelected: true, selectedFile: null })
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            aria-label="Branches shown"
          >
            {SCOPE_LABELS[view.scope]}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={view.scope}
            onValueChange={(value) => setView({ scope: value as LogScope })}
          >
            {(Object.keys(SCOPE_LABELS) as LogScope[]).map((scope) => (
              <DropdownMenuRadioItem key={scope} value={scope}>
                {SCOPE_LABELS[scope]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        title="Compare two branches, tags or commits (or Ctrl/Cmd+click a second commit)"
        onClick={() => openCompareDialog(repoPath)}
      >
        <GitCompareArrows />
        Compare…
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <div className="flex h-7 w-72 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/50">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={view.search}
            onChange={(e) => setView({ search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') jump(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') setView({ search: '' })
            }}
            placeholder={`Search commits${shortcutLabel('history.search') ? ` (${shortcutLabel('history.search')})` : ''}`}
            aria-label="Search commits"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {view.search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setView({ search: '' })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {matches && (
          <>
            <span
              className="w-20 text-right text-xs text-muted-foreground"
              data-testid="search-count"
            >
              {matches.length === 0
                ? 'No results'
                : position === -1
                  ? `${matches.length} found`
                  : `${position + 1} of ${matches.length}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous result"
              disabled={!matches.length}
              onClick={() => jump(-1)}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next result"
              disabled={!matches.length}
              onClick={() => jump(1)}
            >
              <ChevronDown />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
