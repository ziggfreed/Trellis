/**
 * The history timeline: branches as horizontal tracks, with time running
 * left to right. The other way to see history, next to the vertical commit
 * graph (switch in the history toolbar).
 *
 * Layout, top to bottom: the date axis (sticky), the tracks with their
 * branch names on the left, and the minimap of all loaded history.
 *
 * Moving around:
 * - Mouse wheel scrolls the tracks up and down; Shift+wheel or a sideways
 *   trackpad swipe scrolls through time; Ctrl/Cmd+wheel zooms at the pointer.
 * - Drag the empty background to scroll through time.
 * - Keyboard (when the tracks have focus): ←/→ previous/next commit on the
 *   track, ↑/↓ the nearest commit on the track above/below, +/- zoom.
 * - Scrolling back past the oldest loaded commits loads the period before.
 *
 * Commits behave as in the commit list: click to select (details show
 * below), Ctrl/Cmd+click to compare with the selected one, double-click to
 * check out, right-click for actions.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Locate, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import type { Commit, Ref } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeDate, shortSha } from '@/lib/format'
import { useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { BranchMenu } from '@/features/repo-actions/menus'
import { checkoutChoice, openCompare } from '@/features/repo-actions/actions'
import { checkoutChoiceForCommit, checkoutChoiceForRef } from '@/features/history/checkout-target'
import { buildTimeline, type Track } from './tracks'
import { isStale, localRefName } from './timeline-refs'
import { axisTicks, clampViewport, viewportFor, xOf, zoomAt, type Viewport } from './time-scale'
import { ROW_HEIGHT, TimelineCanvas, rowY, type HoverInfo } from './timeline-canvas'
import { MINIMAP_HEIGHT, TimelineMinimap } from './timeline-minimap'
import { useAheadBehind, useTimelineCommits, useTimelineRefs } from './use-timeline-data'
import { useNow } from './use-now'

const DAY = 24 * 60 * 60 * 1000
/** Width of the branch name column. */
const LABEL_WIDTH = 200
const AXIS_HEIGHT = 24
/** The view first shows this much recent history. */
const INITIAL_SPAN = 30 * DAY
/** Load the previous period when the view gets this close (as a share of its width) to the oldest loaded commit. */
const LOAD_AHEAD = 0.25

interface TimelineViewProps {
  repoPath: string
  /** Commits matching the current search, or null when not searching. */
  matches: Set<string> | null
}

export function TimelineView({ repoPath, matches }: TimelineViewProps) {
  const [view, setView] = useRepoView(repoPath)
  const { tracks: trackRefs, refs, activity, base, loaded } = useTimelineRefs(repoPath)
  const refNames = useMemo(() => trackRefs.map((ref) => ref.fullName), [trackRefs])
  const timeline = useTimelineCommits(repoPath, refNames)
  const { commits, domain } = timeline
  const headSha = useStatus(repoPath).data?.branch.oid ?? null
  const headBranch = refs.find((ref) => ref.type === 'branch' && ref.isHead)?.name ?? null

  const model = useMemo(
    () => buildTimeline(commits, trackRefs, { showMerged: view.timelineShowMerged }),
    [commits, trackRefs, view.timelineShowMerged],
  )
  const commitsBySha = useMemo(() => new Map(commits.map((c) => [c.sha, c])), [commits])
  const refsByName = useMemo(() => new Map(refs.map((ref) => [ref.fullName, ref])), [refs])
  const tags = useMemo(() => {
    const byCommit = new Map<string, string[]>()
    for (const ref of refs) {
      if (ref.type !== 'tag') continue
      byCommit.set(ref.sha, [...(byCommit.get(ref.sha) ?? []), ref.name])
    }
    return byCommit
  }, [refs])
  const now = useNow()
  const staleTracks = useMemo(() => {
    const stale = new Set<number>()
    model.tracks.forEach((track, i) => {
      if (track.ref && isStale(track.ref, activity, { base, head: headBranch, now })) stale.add(i)
    })
    return stale
  }, [model, activity, base, headBranch, now])
  // Dates of the shown commits, for the minimap.
  const times = useMemo(() => [...model.placed.values()].map((p) => p.commit.commitDate), [model])
  const counts = useAheadBehind(
    repoPath,
    base ? localRefName(base) : null,
    refNames.filter((name) => name !== (base && localRefName(base))),
  ).data

  // --- Size and viewport -----------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = measureRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const [rawViewport, setRawViewport] = useState<Viewport | null>(null)
  const canLoadMore = timeline.hasNextPage
  // Start on the last month (or all of it, if there's less).
  const viewport = useMemo(() => {
    if (width === 0) return null
    const initial =
      rawViewport ??
      viewportFor(Math.max(domain.start, domain.end - INITIAL_SPAN), domain.end, width)
    return clampViewport(initial, width, domain, canLoadMore)
  }, [rawViewport, width, domain, canLoadMore])
  // The latest viewport, for updates made from event handlers.
  const viewportRef = useRef(viewport)
  useLayoutEffect(() => {
    viewportRef.current = viewport
  })

  const setViewport = useCallback((next: Viewport | ((current: Viewport) => Viewport)) => {
    setRawViewport(() => {
      const current = viewportRef.current
      if (!current) return null
      return typeof next === 'function' ? next(current) : next
    })
  }, [])

  // Load the period before when the view nears the oldest loaded commit.
  const { isFetchingNextPage, fetchNextPage } = timeline
  useEffect(() => {
    if (!viewport || !canLoadMore || isFetchingNextPage) return
    if (viewport.start < domain.start + width * viewport.msPerPx * LOAD_AHEAD) void fetchNextPage()
  }, [viewport, canLoadMore, isFetchingNextPage, fetchNextPage, domain.start, width])

  // Wheel: Ctrl/Cmd zooms, Shift or a sideways swipe scrolls through time,
  // otherwise the tracks scroll up and down as usual. A native listener,
  // because React's wheel events can't prevent the page from zooming.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const area = measureRef.current?.getBoundingClientRect()
      if (!area) return
      const anchorX = event.clientX - area.left
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        setViewport((v) => zoomAt(v, Math.exp(-event.deltaY * 0.002), anchorX))
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault()
        const delta = event.deltaX || event.deltaY
        setViewport((v) => ({ ...v, start: v.start + delta * v.msPerPx }))
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [setViewport])

  // Drag the background to scroll through time.
  const dragFrom = useRef<{ x: number; start: number } | null>(null)
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || !viewport) return
    if ((event.target as Element).closest('[role="option"], text')) return
    dragFrom.current = { x: event.clientX, start: viewport.start }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const from = dragFrom.current
    if (!from) return
    setViewport((v) => ({ ...v, start: from.start - (event.clientX - from.x) * v.msPerPx }))
  }

  // --- Selection -------------------------------------------------------------
  const select = useCallback(
    (sha: string, event?: React.MouseEvent) => {
      const other = view.selectedSha
      if (event && (event.ctrlKey || event.metaKey) && other && other !== sha) {
        void openCompare(repoPath, sha, other)
      } else {
        setView({ selectedSha: sha, seekSelected: false, selectedFile: null })
      }
    },
    [repoPath, setView, view.selectedSha],
  )
  const open = useCallback(
    (sha: string) => void checkoutChoice(repoPath, checkoutChoiceForCommit(sha, refs, headSha)),
    [repoPath, refs, headSha],
  )

  // When the selection changes from elsewhere (sidebar, search), bring the
  // commit into view: scroll through time and to its track.
  const placedSelected = view.selectedSha ? model.placed.get(view.selectedSha) : undefined
  const lastRevealed = useRef<string | null>(null)
  useEffect(() => {
    if (!placedSelected || !viewport || lastRevealed.current === view.selectedSha) return
    lastRevealed.current = view.selectedSha
    const x = xOf(placedSelected.commit.commitDate, viewport)
    if (x < 20 || x > width - 20) {
      setViewport((v) => ({
        ...v,
        start: placedSelected.commit.commitDate - (width / 2) * v.msPerPx,
      }))
    }
    const scroller = scrollRef.current
    const y = rowY(model.tracks[placedSelected.track]!.row) + AXIS_HEIGHT
    if (
      scroller &&
      (y < scroller.scrollTop + AXIS_HEIGHT ||
        y > scroller.scrollTop + scroller.clientHeight - ROW_HEIGHT)
    ) {
      scroller.scrollTop = y - scroller.clientHeight / 2
    }
  }, [placedSelected, view.selectedSha, viewport, width, model, setViewport])

  /** Keyboard: move between commits and zoom. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!viewport) return
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault()
      setViewport((v) => zoomAt(v, event.key === '-' ? 0.5 : 2, width / 2))
      return
    }
    const next = neighbour(event.key, view.selectedSha, model)
    if (next === undefined) return
    event.preventDefault()
    if (next) select(next)
  }

  // --- Hover tooltip ---------------------------------------------------------
  const [hover, setHover] = useState<HoverInfo | null>(null)

  const zoomTo = useCallback(
    (from: number, to: number) => setViewport(viewportFor(from, to, width, width * 0.2)),
    [setViewport, width],
  )
  const jumpTo = useCallback(
    (time: number) => setViewport((v) => ({ ...v, start: time - (width / 4) * v.msPerPx })),
    [setViewport, width],
  )

  if (timeline.error) {
    return <p className="p-4 text-sm text-destructive">{timeline.error.message}</p>
  }
  if (loaded && trackRefs.length === 0) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {view.timelineRefs
          ? 'No branches selected. Pick some with the Branches button above.'
          : 'No branches yet.'}
      </p>
    )
  }

  const rowCount = Math.max(1, model.rows)
  const canvasHeight = rowCount * ROW_HEIGHT

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="timeline">
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto"
      >
        {/* Date axis, stuck to the top while the tracks scroll. */}
        <div
          className="sticky top-0 z-10 flex border-b bg-background"
          style={{ height: AXIS_HEIGHT }}
        >
          <div
            className="flex shrink-0 items-center gap-0.5 border-r px-1"
            style={{ width: LABEL_WIDTH }}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              title="Zoom out (−)"
              onClick={() => setViewport((v) => zoomAt(v, 0.5, width / 2))}
            >
              <ZoomOut />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              title="Zoom in (+)"
              onClick={() => setViewport((v) => zoomAt(v, 2, width / 2))}
            >
              <ZoomIn />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Show all loaded history"
              title="Show all loaded history"
              onClick={() => zoomTo(domain.start, domain.end)}
            >
              <Maximize2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Go to today"
              title="Go to today"
              onClick={() =>
                setViewport((v) => ({ ...v, start: Date.now() - width * 0.85 * v.msPerPx }))
              }
            >
              <Locate />
            </Button>
            {(timeline.isFetching || isFetchingNextPage) && (
              <span className="ml-auto truncate pr-1 text-[10px] text-muted-foreground">
                Loading…
              </span>
            )}
          </div>
          <div ref={measureRef} className="relative min-w-0 flex-1 overflow-hidden">
            {viewport && <Axis viewport={viewport} width={width} />}
          </div>
        </div>

        <div className="flex" style={{ height: canvasHeight }}>
          <TrackLabels
            repoPath={repoPath}
            tracks={model.tracks}
            mergedRowStart={model.mergedRowStart}
            rows={rowCount}
            refsByName={refsByName}
            counts={counts}
            staleTracks={staleTracks}
            activity={activity}
            base={base}
            onPick={(track) => {
              if (track.ref && model.placed.has(track.ref.sha)) select(track.ref.sha)
              else if (track.ref && activity[track.ref.fullName])
                jumpTo(activity[track.ref.fullName]!)
            }}
          />
          {/* The tooltip and messages sit beside the listbox, not in it (a
              listbox may only contain options). */}
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div
              role="listbox"
              tabIndex={0}
              aria-label="Commit timeline"
              className="h-full cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (dragFrom.current = null)}
              onKeyDown={onKeyDown}
            >
              {viewport && (
                <TimelineCanvas
                  repoPath={repoPath}
                  model={model}
                  commitsBySha={commitsBySha}
                  viewport={viewport}
                  width={width}
                  domain={domain}
                  selectedSha={view.selectedSha}
                  headSha={headSha}
                  matches={matches}
                  staleTracks={staleTracks}
                  tags={tags}
                  activity={activity}
                  onSelect={select}
                  onOpen={open}
                  onZoomTo={zoomTo}
                  onJumpTo={jumpTo}
                  onHover={setHover}
                  now={now}
                />
              )}
            </div>
            {hover && <Tooltip hover={hover} width={width} />}
            {loaded && timeline.isSuccess && model.placed.size === 0 && (
              <p className="pointer-events-none absolute inset-x-0 top-1 text-center text-xs text-muted-foreground">
                No commits in the loaded period. Scroll back in time to load older history.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 border-t" style={{ height: MINIMAP_HEIGHT }}>
        <div
          className="flex shrink-0 items-center border-r px-2 text-xs text-muted-foreground"
          style={{ width: LABEL_WIDTH }}
        >
          {canLoadMore ? (
            <button
              type="button"
              className="hover:text-foreground hover:underline disabled:no-underline"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading older history…' : 'Load older history'}
            </button>
          ) : (
            <span>Since {new Date(domain.start).toLocaleDateString()}</span>
          )}
        </div>
        {viewport && (
          <TimelineMinimap
            domain={domain}
            viewport={viewport}
            viewWidth={width}
            times={times}
            onChange={setViewport}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The commit to move to for an arrow key, null if there's none that way, or
 * undefined if the key isn't an arrow key.
 */
function neighbour(
  key: string,
  selected: string | null,
  model: ReturnType<typeof buildTimeline>,
): string | null | undefined {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return undefined
  const current = selected ? model.placed.get(selected) : undefined
  if (!current) {
    // Nothing selected yet: start at the newest commit on the top track.
    return model.tracks.find((t) => t.commits.length)?.commits.at(-1) ?? null
  }
  const track = model.tracks[current.track]!
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const i = track.commits.indexOf(selected!)
    return track.commits[i + (key === 'ArrowLeft' ? -1 : 1)] ?? null
  }
  // Up/down: the commit nearest in time on the next row that has any.
  const step = key === 'ArrowUp' ? -1 : 1
  for (let row = track.row + step; row >= 0 && row < model.rows; row += step) {
    let best: Commit | null = null
    for (const other of model.tracks) {
      if (other.row !== row) continue
      for (const sha of other.commits) {
        const commit = model.placed.get(sha)!.commit
        const distance = Math.abs(commit.commitDate - current.commit.commitDate)
        if (!best || distance < Math.abs(best.commitDate - current.commit.commitDate)) best = commit
      }
    }
    if (best) return best.sha
  }
  return null
}

/** The date labels along the top. */
function Axis({ viewport, width }: { viewport: Viewport; width: number }) {
  const ticks = axisTicks(viewport, width)
  return (
    <svg width={width} height={AXIS_HEIGHT} className="block select-none" aria-hidden>
      {ticks.map((tick) => {
        const x = xOf(tick.time, viewport)
        return (
          <g key={tick.time}>
            <line x1={x} x2={x} y1={AXIS_HEIGHT - 6} y2={AXIS_HEIGHT} className="stroke-border" />
            <text
              x={x + 4}
              y={AXIS_HEIGHT - 8}
              className={cn(
                'text-[11px]',
                tick.major ? 'fill-foreground font-medium' : 'fill-muted-foreground',
              )}
            >
              {tick.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface TrackLabelsProps {
  repoPath: string
  tracks: Track[]
  mergedRowStart: number | null
  rows: number
  refsByName: ReadonlyMap<string, Ref>
  counts: Record<string, { ahead: number; behind: number }> | undefined
  staleTracks: ReadonlySet<number>
  activity: Readonly<Record<string, number>>
  base: string | null
  onPick: (track: Track) => void
}

/** Branch names down the left, with ahead/behind counts and stale markers. */
function TrackLabels(props: TrackLabelsProps) {
  const { tracks, refsByName, counts, base } = props
  return (
    <div className="relative shrink-0 border-r" style={{ width: LABEL_WIDTH }}>
      {tracks.map((track, i) => {
        if (!track.ref) return null
        const ref = refsByName.get(track.ref.fullName)
        const stale = props.staleTracks.has(i)
        const count = counts?.[track.ref.fullName]
        const last = props.activity[track.ref.fullName]
        const label = (
          <div
            data-testid="timeline-track"
            data-stale={stale || undefined}
            className={cn(
              'absolute inset-x-0 flex cursor-default items-center gap-1.5 border-b border-border/50 px-2 text-sm hover:bg-accent/50',
              stale && 'opacity-50',
            )}
            style={{ top: track.row * ROW_HEIGHT, height: ROW_HEIGHT }}
            title={[
              track.name,
              last && `Last commit ${formatRelativeDate(last)}`,
              stale && 'Stale: no commits for over a month',
              count &&
                base &&
                `${count.ahead} commits not on ${base}, ${count.behind} on ${base} that it doesn't have`,
            ]
              .filter(Boolean)
              .join('\n')}
            onClick={() => props.onPick(track)}
            onDoubleClick={() =>
              ref &&
              void checkoutChoice(
                props.repoPath,
                checkoutChoiceForRef(ref, [...refsByName.values()]),
              )
            }
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: `var(--graph-${track.color % 8})` }}
            />
            <span className={cn('min-w-0 flex-1 truncate', ref?.isHead && 'font-semibold')}>
              {track.name}
            </span>
            {stale && <span className="shrink-0 text-[10px] text-muted-foreground">stale</span>}
            {count && (count.ahead > 0 || count.behind > 0) && (
              <span
                className="shrink-0 font-mono text-[10px] text-muted-foreground"
                data-testid="timeline-counts"
              >
                {count.ahead > 0 && `↑${count.ahead}`}
                {count.ahead > 0 && count.behind > 0 && ' '}
                {count.behind > 0 && `↓${count.behind}`}
              </span>
            )}
          </div>
        )
        return ref?.type === 'branch' ? (
          <BranchMenu key={track.id} repo={props.repoPath} branch={ref}>
            {label}
          </BranchMenu>
        ) : (
          <div key={track.id}>{label}</div>
        )
      })}
      {props.mergedRowStart !== null &&
        Array.from({ length: props.rows - props.mergedRowStart }, (_, i) => (
          <div
            key={`merged-${i}`}
            className="absolute inset-x-0 flex items-center border-b border-border/50 px-2 text-xs text-muted-foreground italic"
            style={{ top: (props.mergedRowStart! + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
          >
            {i === 0 && 'Merged branches'}
          </div>
        ))}
    </div>
  )
}

/** Details of the commit (or group of commits) under the pointer. */
function Tooltip({ hover, width }: { hover: HoverInfo; width: number }) {
  const [first] = hover.commits
  if (!first) return null
  const many = hover.commits.length > 1
  const newest = hover.commits[hover.commits.length - 1]!
  // Keep it inside the view: flip to the left of the pointer near the right edge.
  const flip = hover.x > width - 280
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 w-64 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
      style={{
        top: hover.y + 12,
        ...(flip ? { right: width - hover.x + 8 } : { left: hover.x + 8 }),
      }}
    >
      {many ? (
        <>
          <p className="font-medium">{hover.commits.length} commits</p>
          <p className="text-muted-foreground">
            {formatDateTime(first.commitDate)} – {formatDateTime(newest.commitDate)}
          </p>
          <p className="mt-1 text-muted-foreground">Click to zoom in</p>
        </>
      ) : (
        <>
          <p className="line-clamp-2 font-medium">{first.subject}</p>
          <p className="mt-0.5 text-muted-foreground">
            {first.authorName} · {formatRelativeDate(first.commitDate)} ·{' '}
            <span className="font-mono">{shortSha(first.sha)}</span>
          </p>
        </>
      )}
    </div>
  )
}
