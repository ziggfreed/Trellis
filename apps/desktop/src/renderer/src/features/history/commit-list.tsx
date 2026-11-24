/**
 * The list of commits in the History view.
 *
 * Repositories can have hundreds of thousands of commits, so:
 * - commits are loaded in pages of LOG_PAGE_SIZE as you scroll (useLog), and
 * - only the rows on screen are rendered (TanStack Virtual).
 *
 * Keyboard: ↑/↓ move the selection when the list has focus.
 * The commit graph column arrives in Phase 2.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Commit } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeDate, shortSha } from '@/lib/format'
import { useLog, useRefs } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { refsBySha } from '@/features/sidebar/group-refs'
import { RefBadge } from './ref-badge'

const ROW_HEIGHT = 28
/** Start loading the next page when this many rows from the end. */
const LOAD_MORE_THRESHOLD = 50

export function CommitList({ repoPath }: { repoPath: string }) {
  const log = useLog(repoPath)
  const refs = useRefs(repoPath).data
  const [view, setView] = useRepoView(repoPath)
  const scrollRef = useRef<HTMLDivElement>(null)

  const commits = useMemo(() => log.data?.pages.flatMap((p) => p.commits) ?? [], [log.data])
  const refMap = useMemo(() => refsBySha(refs ?? []), [refs])
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

  // Load the next page when the user scrolls near the end.
  const lastIndex = items.at(-1)?.index ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= commits.length - LOAD_MORE_THRESHOLD) {
      void fetchNextPage()
    }
  }, [lastIndex, commits.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Keep the selected commit visible, e.g. after clicking a branch in the sidebar.
  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [selectedIndex, virtualizer])

  const select = (commit: Commit) => setView({ selectedSha: commit.sha, selectedFile: null })

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
    <div
      ref={scrollRef}
      tabIndex={0}
      role="listbox"
      aria-label="Commits"
      onKeyDown={onKeyDown}
      className="h-full overflow-auto outline-none"
    >
      <div style={{ height: virtualizer.getTotalSize() }} className="relative">
        {items.map((item) => {
          const commit = commits[item.index]!
          const selected = item.index === selectedIndex
          return (
            <div
              key={commit.sha}
              role="option"
              aria-selected={selected}
              data-testid="commit-row"
              onClick={() => select(commit)}
              style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
              className={cn(
                'absolute inset-x-0 top-0 flex cursor-default items-center gap-3 px-3 text-sm',
                selected ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {refMap.get(commit.sha)?.map((ref) => (
                  <RefBadge key={ref.fullName} gitRef={ref} />
                ))}
                <span className="truncate">{commit.subject}</span>
              </div>
              <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">
                {commit.authorName}
              </span>
              <span
                className="w-28 shrink-0 truncate text-xs text-muted-foreground"
                title={formatDateTime(commit.authorDate)}
              >
                {formatRelativeDate(commit.authorDate)}
              </span>
              <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {shortSha(commit.sha)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
