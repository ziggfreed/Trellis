/**
 * Toolbar above the history: Graph/Timeline switch, which branches to show,
 * Compare, columns and search.
 *
 * Search matches commit messages, authors and hashes; the Filter popover
 * narrows by author, path, date or code changes. Matching commits are
 * highlighted in the list; ↑/↓ buttons (or Enter / Shift+Enter in the box)
 * jump between them, loading more history if a match is further back.
 */
import { useRef } from 'react'
import {
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Loader2,
  GitCommitVertical,
  Search,
  SquareChartGantt,
  X,
} from 'lucide-react'
import type { HistoryView, LogOrder, LogScope } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'
import { openCompareDialog } from '@/features/compare/compare-dialog'
import { FilterPopover } from './filter-popover'
import { ColumnsDropdown } from './columns-menu'
import { useSettingsStore } from '@/features/settings/settings-store'
import { TimelineControls } from '@/features/timeline/branch-picker'
import { cn } from '@/lib/utils'

export const SCOPE_LABELS: Record<LogScope, string> = {
  all: 'All branches',
  local: 'Local branches',
  head: 'Current branch',
}

/**
 * The commit graph's two orders (see LogOrder in packages/git). Both keep
 * parents below their children; they differ in whether branches' commits
 * are kept together or mixed by date.
 */
const ORDER_OPTIONS: { id: LogOrder; label: string; hint: string }[] = [
  {
    id: 'topo',
    label: 'Branches together',
    hint: "Each branch's commits in one run: fewer crossing lines",
  },
  {
    id: 'date',
    label: 'By date',
    hint: 'Commits from all branches mixed in the order they were made',
  },
]

interface HistoryToolbarProps {
  repoPath: string
  /** Hashes of matching commits, newest first (null while no search is active). */
  matches: string[] | null
  /** True while a search is under way (results may be out of date). */
  searching?: boolean
}

export function HistoryToolbar({ repoPath, matches, searching = false }: HistoryToolbarProps) {
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

  const historyView = useSettingsStore((s) => s.settings.historyView)
  const order = useSettingsStore((s) => s.settings.historyOrder)
  const updateSettings = useSettingsStore((s) => s.update)
  const timeline = historyView === 'timeline'

  return (
    <div className="@container flex h-9 shrink-0 items-center gap-2 border-b px-2">
      <ViewSwitch />
      {timeline ? (
        <TimelineControls repoPath={repoPath} />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              aria-label="Branches shown"
              title="Which branches to show, and the order of commits"
            >
              {SCOPE_LABELS[view.scope]}
              {order === 'date' && <span className="hidden @3xl:inline">· by date</span>}
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
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Order</DropdownMenuLabel>
            {/* Remembered between launches, for every repository. */}
            <DropdownMenuRadioGroup
              value={order}
              onValueChange={(value) => updateSettings({ historyOrder: value as LogOrder })}
            >
              {ORDER_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id} title={option.hint}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        aria-label="Compare…"
        title="Compare two branches, tags or commits (or Ctrl/Cmd+click a second commit)"
        onClick={() => openCompareDialog(repoPath)}
      >
        <GitCompareArrows />
        {/* Labels drop out when the toolbar is narrow; the icons stay. */}
        <span className="hidden @4xl:inline">Compare…</span>
      </Button>

      <div className="ml-auto flex min-w-0 items-center gap-1">
        {!timeline && <ColumnsDropdown />}
        <FilterPopover repoPath={repoPath} />
        <div className="flex h-7 w-72 min-w-24 shrink items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/50">
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
        {searching && !matches && (
          <span
            className="flex w-20 items-center justify-end gap-1 text-xs text-muted-foreground"
            data-testid="search-count"
          >
            <Loader2 className="size-3 animate-spin" />
            Searching…
          </span>
        )}
        {matches && (
          <>
            <span
              className="w-20 text-right text-xs text-muted-foreground"
              data-testid="search-count"
            >
              {searching
                ? 'Searching…'
                : matches.length === 0
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

const VIEWS: { id: HistoryView; label: string; icon: typeof GitCommitVertical }[] = [
  { id: 'graph', label: 'Graph', icon: GitCommitVertical },
  { id: 'timeline', label: 'Timeline', icon: SquareChartGantt },
]

/** Switch between the vertical commit graph and the horizontal timeline (remembered). */
function ViewSwitch() {
  const current = useSettingsStore((s) => s.settings.historyView)
  const update = useSettingsStore((s) => s.update)
  return (
    <div role="radiogroup" aria-label="History view" className="flex rounded-md border p-0.5">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          aria-label={label}
          title={
            id === 'graph'
              ? 'Commit graph: one row per commit'
              : 'Timeline: branches as tracks over time'
          }
          onClick={() => update({ historyView: id })}
          className={cn(
            'flex h-6 items-center gap-1 rounded-sm px-2 text-xs text-muted-foreground hover:text-foreground',
            current === id && 'bg-accent text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden @2xl:inline">{label}</span>
        </button>
      ))}
    </div>
  )
}
