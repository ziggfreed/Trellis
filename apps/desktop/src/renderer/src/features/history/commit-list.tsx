/**
 * The list of commits in the History view, with the commit graph on the left.
 *
 * Repositories can have hundreds of thousands of commits, so:
 * - commits are loaded in pages as you scroll (useLog, streamed by main), and
 * - only the rows on screen are rendered (TanStack Virtual).
 * The graph layout is extended page by page (IncrementalLayout).
 *
 * Keyboard: ↑/↓ move the selection when the list has focus.
 * Right-click a commit for actions (branch, tag, cherry-pick, revert, reset...).
 * Drag a branch label onto another row to merge, rebase or move it.
 * Ctrl/Cmd+click a second commit to compare the two.
 * Double-click a commit (or one of its branch labels) to check it out: see
 * checkout-target.ts for which branch is picked.
 * Hover a branch label to highlight that branch's line of commits.
 * The columns after the message can be chosen (columns.ts); right-click the
 * headers to change them.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Commit } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeDate, shortSha } from '@/lib/format'
import { useLog, useRefs, useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { refsBySha } from '@/features/sidebar/group-refs'
import { RefBadge } from './ref-badge'
import { CommitDecorations, useCommitDecorations } from '@/features/plugins/commit-decorations'
import { BisectBadge, bisectRole, useBisect } from '@/features/bisect/bisect'
import { CommitMenu } from '@/features/repo-actions/menus'
import { checkoutChoice, openCompare } from '@/features/repo-actions/actions'
import { checkoutChoiceForCommit, checkoutChoiceForRef } from './checkout-target'
import { firstParentLine, firstParentMap } from './branch-highlight'
import { handleRefDrop, isRefDrag } from '@/features/drag-drop/drop-menu'
import { GraphCell, LANE_WIDTH } from './graph-cell'
import { visibleColumns, type ColumnDef } from './columns'
import { ColumnsContextMenu } from './columns-menu'
import { useCommitStats } from './commit-stats'
import { useSettingsStore } from '@/features/settings/settings-store'
import type { CommitStats } from '@shared/ipc'
import { IncrementalLayout } from './incremental-layout'
import type { GraphRow } from '@trellis/graph-layout'

/** Number of lanes a row draws in (its rightmost lane + 1). */
function rowWidth(row: GraphRow): number {
  let max = row.lane
  for (const edge of row.top) max = Math.max(max, edge.from, edge.to)
  for (const edge of row.bottom) max = Math.max(max, edge.from, edge.to)
  return max + 1
}

const ROW_HEIGHT = 28
/** Start loading the next page when this many rows from the end. */
const LOAD_MORE_THRESHOLD = 50
/** Never draw more lanes than this; very wide graphs are cut off at the right. */
const MAX_GRAPH_LANES = 24
/** When seeking a commit that isn't loaded, give up after loading this many. */
const SEEK_LIMIT = 50_000

interface CommitListProps {
  repoPath: string
  /** Commits matching the current search, or null when not searching. */
  matches: Set<string> | null
}

export function CommitList({ repoPath, matches }: CommitListProps) {
  const [view, setView] = useRepoView(repoPath)
  const log = useLog(repoPath, view.scope)
  const refs = useRefs(repoPath).data
  const headSha = useStatus(repoPath).data?.branch.oid ?? null
  const scrollRef = useRef<HTMLDivElement>(null)
  const [incremental] = useState(() => new IncrementalLayout())
  /** Row a branch is being dragged over, to highlight it. */
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  /** Commit of the branch label under the pointer; its line is highlighted. */
  const [hoveredTip, setHoveredTip] = useState<string | null>(null)

  const pages = log.data?.pages
  const commits = useMemo(() => pages?.flatMap((p) => p.commits) ?? [], [pages])
  // The checked-out commit is kept in the graph's leftmost lane.
  const graph = useMemo(
    () => incremental.update(pages ?? [], headSha),
    [incremental, pages, headSha],
  )
  const refMap = useMemo(() => refsBySha(refs ?? []), [refs])
  const decorations = useCommitDecorations(repoPath)
  const bisect = useBisect(repoPath).data
  const firstParents = useMemo(() => firstParentMap(commits), [commits])
  const highlighted = useMemo(
    () => (hoveredTip ? firstParentLine(firstParents, hoveredTip) : null),
    [firstParents, hoveredTip],
  )
  const selectedIndex = commits.findIndex((c) => c.sha === view.selectedSha)

  // This rule warns that the React Compiler can't optimise this hook. We don't
  // use the React Compiler, so it's safe to ignore.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })
  const items = virtualizer.getVirtualItems()

  // Size the graph column to the lanes used by the rows on screen, not the
  // whole history: one wide section deep in the past shouldn't push every
  // commit message to the right. The width animates as you scroll.
  let visibleLanes = 1
  for (const item of items) {
    const row = graph.rows[item.index]
    if (row) visibleLanes = Math.max(visibleLanes, rowWidth(row))
  }
  const graphLanes = Math.min(visibleLanes, MAX_GRAPH_LANES)

  const columns = visibleColumns(useSettingsStore((s) => s.settings.historyColumns))
  const showStats = columns.some((c) => c.id === 'changes')
  const visibleShas = items.map((item) => commits[item.index]?.sha ?? '')
  const stats = useCommitStats(repoPath, visibleShas, showStats)

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log
  const lastIndex = items.at(-1)?.index ?? 0
  const seeking =
    view.seekSelected &&
    view.selectedSha !== null &&
    selectedIndex === -1 &&
    commits.length < SEEK_LIMIT

  // Load the next page when the user scrolls near the end, or while looking
  // for a selected commit that hasn't loaded yet.
  useEffect(() => {
    const nearEnd = lastIndex >= commits.length - LOAD_MORE_THRESHOLD
    if (hasNextPage && !isFetchingNextPage && (nearEnd || seeking)) void fetchNextPage()
  }, [lastIndex, commits.length, hasNextPage, isFetchingNextPage, fetchNextPage, seeking])

  // Keep the selected commit visible, e.g. after clicking a branch in the sidebar.
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  const select = (commit: Commit) =>
    setView({ selectedSha: commit.sha, seekSelected: false, selectedFile: null })

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = commits[Math.max(0, Math.min(commits.length - 1, selectedIndex + step))]
    if (next) select(next)
  }

  if (log.error) {
    return <p className="p-4 text-sm text-destructive">{log.error.message}</p>
  }
  if (log.isSuccess && commits.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No commits yet.
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ColumnsContextMenu>
        <div
          className="flex h-6 shrink-0 [scrollbar-gutter:stable] items-center gap-3 overflow-hidden border-b pr-3 pl-2 text-xs text-muted-foreground"
          data-testid="history-header"
          title="Right-click to choose columns"
        >
          <span
            className="min-w-0 flex-1 truncate"
            style={{ paddingLeft: graphLanes * LANE_WIDTH + 12 }}
          >
            Message
          </span>
          {columns.map((column) => (
            <span key={column.id} className={cn(column.width, 'shrink-0 truncate')}>
              {column.label}
            </span>
          ))}
        </div>
      </ColumnsContextMenu>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="listbox"
        aria-label="Commits"
        aria-busy={seeking}
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-auto outline-none"
      >
        <div style={{ height: virtualizer.getTotalSize() }} className="relative">
          {items.map((item) => {
            const commit = commits[item.index]!
            const row = graph.rows[item.index]
            const selected = item.index === selectedIndex
            // While a branch label is hovered, fade everything off its line;
            // otherwise fade commits that don't match the search/filter.
            const dimmed = highlighted
              ? !highlighted.has(commit.sha)
              : matches !== null && !matches.has(commit.sha)
            return (
              <CommitMenu key={commit.sha} repo={repoPath} commit={commit}>
                <div
                  role="option"
                  aria-selected={selected}
                  data-testid="commit-row"
                  data-match={matches?.has(commit.sha) || undefined}
                  data-dimmed={dimmed || undefined}
                  onClick={(event) => {
                    // Ctrl/Cmd+click a second commit to compare it with the selected one.
                    const other = view.selectedSha
                    if ((event.ctrlKey || event.metaKey) && other && other !== commit.sha) {
                      void openCompare(repoPath, commit.sha, other)
                    } else {
                      select(commit)
                    }
                  }}
                  // Stop a double-click from selecting the row's text.
                  onMouseDown={(event) => event.detail > 1 && event.preventDefault()}
                  onDoubleClick={(event) => {
                    if (event.ctrlKey || event.metaKey) return
                    const choice = checkoutChoiceForCommit(commit.sha, refs ?? [], headSha)
                    void checkoutChoice(repoPath, choice)
                  }}
                  onDragOver={(event) => {
                    if (!isRefDrag(event)) return
                    event.preventDefault()
                    setDropIndex(item.index)
                  }}
                  onDragLeave={() => setDropIndex((i) => (i === item.index ? null : i))}
                  onDrop={(event) => {
                    setDropIndex(null)
                    if (!isRefDrag(event)) return
                    event.preventDefault()
                    // Dropped on a branch label? Use that branch as the target.
                    const label = (event.target as HTMLElement).closest('[data-ref]')
                    const ref = refs?.find((r) => r.fullName === label?.getAttribute('data-ref'))
                    void handleRefDrop(repoPath, event, {
                      sha: commit.sha,
                      ...(ref ? { ref } : {}),
                    })
                  }}
                  style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
                  className={cn(
                    'absolute inset-x-0 top-0 flex cursor-default items-center gap-3 pr-3 pl-2 text-sm',
                    selected ? 'bg-accent' : 'hover:bg-accent/50 data-[state=open]:bg-accent/50',
                    dropIndex === item.index && 'ring-2 ring-brand ring-inset',
                  )}
                >
                  {row && (
                    <div
                      className="shrink-0 overflow-hidden transition-[width] duration-150"
                      style={{ width: graphLanes * LANE_WIDTH }}
                    >
                      <GraphCell
                        row={row}
                        lanes={graph.width}
                        height={ROW_HEIGHT}
                        isMerge={commit.parents.length > 1}
                        isHead={commit.sha === headSha}
                      />
                    </div>
                  )}
                  <div
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-1.5',
                      dimmed && 'opacity-40',
                    )}
                  >
                    {refMap.get(commit.sha)?.map((ref) => (
                      <RefBadge
                        key={ref.fullName}
                        gitRef={ref}
                        onHoverChange={(hovering) => setHoveredTip(hovering ? commit.sha : null)}
                        onDoubleClick={() =>
                          void checkoutChoice(repoPath, checkoutChoiceForRef(ref, refs ?? []))
                        }
                      />
                    ))}
                    {(() => {
                      const role = bisectRole(bisect, commit.sha)
                      return role && <BisectBadge role={role} />
                    })()}
                    <span className="truncate">{commit.subject}</span>
                    {decorations.has(commit.sha) && (
                      <CommitDecorations decorations={decorations.get(commit.sha)!} />
                    )}
                  </div>
                  {columns.map((column) => (
                    <span
                      key={column.id}
                      className={cn(
                        column.width,
                        'shrink-0 truncate text-xs text-muted-foreground',
                        column.id === 'sha' && 'font-mono',
                        dimmed && 'opacity-40',
                      )}
                      {...cellTitle(column, commit, stats[commit.sha])}
                    >
                      {cellContent(column, commit, stats[commit.sha])}
                    </span>
                  ))}
                </div>
              </CommitMenu>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** The text in one optional column of a commit's row. */
function cellContent(column: ColumnDef, commit: Commit, stats: CommitStats | undefined) {
  switch (column.id) {
    case 'changes':
      if (!stats) return null
      return (
        <>
          {stats.files} {stats.files === 1 ? 'file' : 'files'}{' '}
          <span className="text-change-added">+{stats.insertions}</span>{' '}
          <span className="text-change-deleted">−{stats.deletions}</span>
        </>
      )
    case 'author':
      return commit.authorName
    case 'date':
      return formatRelativeDate(commit.authorDate)
    case 'committer':
      return commit.committerName
    case 'commitDate':
      return formatRelativeDate(commit.commitDate)
    case 'sha':
      return shortSha(commit.sha)
  }
}

/** Hover text for a cell: the full value where the cell shows a short one. */
function cellTitle(column: ColumnDef, commit: Commit, stats: CommitStats | undefined) {
  switch (column.id) {
    case 'changes':
      return stats
        ? {
            title: `${stats.files} files changed, ${stats.insertions} lines added, ${stats.deletions} removed`,
          }
        : {}
    case 'author':
      return { title: `${commit.authorName} <${commit.authorEmail}>` }
    case 'committer':
      return { title: `${commit.committerName} <${commit.committerEmail}>` }
    case 'date':
      return { title: formatDateTime(commit.authorDate) }
    case 'commitDate':
      return { title: formatDateTime(commit.commitDate) }
    case 'sha':
      return { title: commit.sha }
  }
}
