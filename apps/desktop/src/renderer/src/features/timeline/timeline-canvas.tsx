/**
 * Draws the timeline's tracks as one SVG: a line per branch, a dot per
 * commit at its date, curves where branches fork off and merge back, tags,
 * and markers for branches whose commit is elsewhere.
 *
 * Only what's within (or just beyond) the visible dates is drawn, so long
 * histories stay quick. Dots closer than a few pixels are drawn as one
 * pill with a count; clicking it zooms in on those commits.
 */
import { memo } from 'react'
import type { Commit } from '@shared/ipc'
import { formatRelativeDate, shortSha } from '@/lib/format'
import { CommitMenu } from '@/features/repo-actions/menus'
import { clusterByX, xOf, type Cluster, type Domain, type Viewport } from './time-scale'
import type { TimelineModel } from './tracks'

export const ROW_HEIGHT = 32
export const rowY = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2

const DOT_RADIUS = 4.5
/** Dots nearer than this (in pixels) are grouped. */
const CLUSTER_GAP = DOT_RADIUS * 2 + 2
/** How far curves at forks and merges reach along the track. */
const BEND = 22
/** Draw things this far beyond the visible edges, so lines run off-screen. */
const OVERDRAW = 60

const color = (index: number) => `var(--graph-${index % 8})`

/**
 * Text drawn over lines gets an outline in the background colour, so it
 * stays readable where lines cross it.
 */
const HALO = { stroke: 'var(--background)', strokeWidth: 3, paintOrder: 'stroke' } as const

export interface HoverInfo {
  x: number
  y: number
  commits: Commit[]
}

export interface TimelineCanvasProps {
  repoPath: string
  model: TimelineModel
  /** Every loaded commit, shown or not (for markers of branches without their own). */
  commitsBySha: ReadonlyMap<string, Commit>
  viewport: Viewport
  width: number
  domain: Domain
  selectedSha: string | null
  headSha: string | null
  /** Commits matching the search/filter, or null when not searching. */
  matches: ReadonlySet<string> | null
  /** Indexes of tracks drawn faded (stale branches). */
  staleTracks: ReadonlySet<number>
  /** Tag names by commit. */
  tags: ReadonlyMap<string, string[]>
  /** When each branch last had a commit (for branches older than the loaded history). */
  activity: Readonly<Record<string, number>>
  onSelect: (sha: string, event: React.MouseEvent) => void
  onOpen: (sha: string) => void
  /** Zoom so `from`..`to` fills the view (clicking a group of dots). */
  onZoomTo: (from: number, to: number) => void
  /** Scroll to a date (a branch's last commit, older than what's loaded). */
  onJumpTo: (time: number) => void
  onHover: (info: HoverInfo | null) => void
  /** The current time (see use-now.ts). */
  now: number
}

export const TimelineCanvas = memo(function TimelineCanvas(props: TimelineCanvasProps) {
  const { model, viewport, width, commitsBySha, selectedSha, headSha, matches } = props
  const height = Math.max(1, model.rows) * ROW_HEIGHT
  const x = (time: number) => xOf(time, viewport)
  const onScreen = (px: number) => px >= -OVERDRAW && px <= width + OVERDRAW
  const placedX = (sha: string) => x(model.placed.get(sha)!.commit.commitDate)
  const placedY = (sha: string) => rowY(model.tracks[model.placed.get(sha)!.track]!.row)
  const faded = (track: number) => props.staleTracks.has(track)

  // Lines first, so dots sit on top.
  const lines: React.ReactNode[] = []
  model.edges.forEach((edge, i) => {
    const x1 = placedX(edge.from)
    const x2 = placedX(edge.to)
    if (Math.max(x1, x2) < -OVERDRAW || Math.min(x1, x2) > width + OVERDRAW) return
    const y1 = placedY(edge.from)
    const y2 = placedY(edge.to)
    const bend = Math.max(0, Math.min(BEND, x2 - x1))
    let d: string
    if (edge.kind === 'line' || y1 === y2) d = `M${x1} ${y1}H${x2}`
    else if (bend === 0)
      d = `M${x1} ${y1}L${x2} ${y2}` // child older than parent (clock skew)
    else if (edge.kind === 'fork')
      // Leave the parent's track straight away, then run along the branch's own.
      d = `M${x1} ${y1}C${x1 + bend / 2} ${y1} ${x1 + bend / 2} ${y2} ${x1 + bend} ${y2}H${x2}`
    // A merge runs along the branch's track and joins just before the merge commit.
    else d = `M${x1} ${y1}H${x2 - bend}C${x2 - bend / 2} ${y1} ${x2 - bend / 2} ${y2} ${x2} ${y2}`
    const track = model.placed.get(edge.kind === 'merge' ? edge.from : edge.to)!.track
    lines.push(
      <path
        key={i}
        d={d}
        fill="none"
        stroke={color(edge.color)}
        strokeWidth={2}
        opacity={faded(track) ? 0.35 : 1}
      />,
    )
  })

  for (const stub of model.stubs) {
    const cx = placedX(stub.sha)
    if (!onScreen(cx)) continue
    const cy = placedY(stub.sha)
    const track = model.placed.get(stub.sha)!.track
    if (stub.kind === 'before') {
      // History continues before what's loaded: a dashed line back to the start.
      const from = Math.max(-OVERDRAW, x(props.domain.start))
      lines.push(
        <path
          key={`before-${stub.sha}`}
          d={`M${from} ${cy}H${cx}`}
          stroke={color(model.tracks[track]!.color)}
          strokeWidth={2}
          strokeDasharray="3 4"
          opacity={faded(track) ? 0.35 : 0.7}
        />,
      )
    } else {
      // A merge of a branch that isn't shown: a short curve coming in from below.
      lines.push(
        <path
          key={`merged-${stub.sha}`}
          d={`M${cx - 14} ${cy + 11}Q${cx - 3} ${cy + 11} ${cx} ${cy}`}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={1.5}
          opacity={0.6}
        />,
      )
    }
  }

  // Branches with no commit of their own on screen.
  const markers: React.ReactNode[] = []
  model.tracks.forEach((track, index) => {
    const y = rowY(track.row)
    if (track.tip === 'shared' && track.ref) {
      // The branch points at a commit on another track: a hollow dot here,
      // joined to it with a dotted line.
      const commit = commitsBySha.get(track.ref.sha)
      if (!commit) return
      const cx = x(commit.commitDate)
      if (!onScreen(cx)) return
      const owner = model.placed.get(track.ref.sha)
      markers.push(
        <g key={`shared-${track.id}`} opacity={faded(index) ? 0.45 : 1}>
          {owner && (
            <path
              d={`M${cx} ${rowY(model.tracks[owner.track]!.row)}V${y}`}
              stroke={color(track.color)}
              strokeWidth={1.5}
              strokeDasharray="2 3"
            />
          )}
          <circle
            cx={cx}
            cy={y}
            r={DOT_RADIUS}
            fill="var(--background)"
            stroke={color(track.color)}
            strokeWidth={2}
          >
            <title>{`${track.name} is at ${shortSha(commit.sha)} (no commits of its own)`}</title>
          </circle>
        </g>,
      )
    } else if (track.tip === 'outside' && track.ref) {
      // The branch's last commit is older than what's loaded.
      const last = props.activity[track.ref.fullName]
      const left = Math.max(8, x(props.domain.start) + 8)
      if (last === undefined || left > width) return
      markers.push(
        <text
          key={`outside-${track.id}`}
          x={left}
          y={y + 4}
          className="cursor-pointer fill-muted-foreground text-xs hover:fill-foreground"
          {...HALO}
          opacity={faded(index) ? 0.6 : 1}
          onClick={() => props.onJumpTo(last)}
        >
          {`← Last commit ${formatRelativeDate(last)}`}
        </text>,
      )
    }
  })

  // Dots, grouped where they'd overlap.
  const dots: React.ReactNode[] = []
  const labels: React.ReactNode[] = []
  model.tracks.forEach((track, index) => {
    const y = rowY(track.row)
    const visible = track.commits
      .map((sha) => model.placed.get(sha)!.commit)
      .filter((commit) => onScreen(x(commit.commitDate)))
      .sort((a, b) => a.commitDate - b.commitDate)
    if (visible.length === 0) return
    const opacity = faded(index) ? 0.45 : 1
    // Merged branches share rows, so name them where they start.
    if (!track.ref) {
      labels.push(
        <text
          key={`name-${track.id}`}
          x={x(visible[0]!.commitDate) - 2}
          y={y - 8}
          className="pointer-events-none fill-muted-foreground text-[10px]"
          {...HALO}
        >
          {track.name}
        </text>,
      )
    }
    for (const cluster of clusterByX(visible, (c) => x(c.commitDate), CLUSTER_GAP)) {
      dots.push(
        cluster.items.length === 1 ? (
          <CommitDot
            key={cluster.items[0]!.sha}
            {...props}
            commit={cluster.items[0]!}
            y={y}
            trackColor={track.color}
            opacity={opacity}
            selected={cluster.items[0]!.sha === selectedSha}
            head={cluster.items[0]!.sha === headSha}
            dimmed={matches !== null && !matches.has(cluster.items[0]!.sha)}
          />
        ) : (
          <ClusterPill
            key={`cluster-${cluster.items[0]!.sha}`}
            {...props}
            cluster={cluster}
            y={y}
            trackColor={track.color}
            opacity={opacity}
          />
        ),
      )
    }
  })

  // Tags, as small flags above their commit.
  props.tags.forEach((names, sha) => {
    const placed = model.placed.get(sha)
    if (!placed) return
    const cx = x(placed.commit.commitDate)
    if (!onScreen(cx)) return
    const cy = rowY(model.tracks[placed.track]!.row)
    labels.push(
      <g key={`tag-${sha}`} className="pointer-events-none" data-testid="timeline-tag">
        <path
          d={`M${cx} ${cy - 6}V${cy - 15}`}
          className="stroke-muted-foreground"
          strokeWidth={1}
        />
        <text
          x={cx + 3}
          y={cy - 9}
          className="fill-muted-foreground text-[10px] font-medium"
          {...HALO}
        >
          {names.join(', ')}
        </text>
      </g>,
    )
  })

  // "Now", so it's clear where the timeline ends.
  const nowX = x(props.now)

  return (
    <svg width={width} height={height} className="block select-none">
      {Array.from({ length: model.rows }, (_, row) => (
        <line
          key={row}
          x1={0}
          x2={width}
          y1={(row + 1) * ROW_HEIGHT - 0.5}
          y2={(row + 1) * ROW_HEIGHT - 0.5}
          className="stroke-border"
          strokeOpacity={0.5}
        />
      ))}
      {nowX >= 0 && nowX <= width && (
        <line
          x1={nowX}
          x2={nowX}
          y1={0}
          y2={height}
          className="stroke-brand"
          strokeOpacity={0.4}
          strokeDasharray="2 3"
        />
      )}
      {lines}
      {markers}
      {labels}
      {dots}
    </svg>
  )
})

interface DotProps extends TimelineCanvasProps {
  commit: Commit
  y: number
  trackColor: number
  opacity: number
  selected: boolean
  head: boolean
  dimmed: boolean
}

/** One commit: click to select, double-click to check out, right-click for actions. */
function CommitDot({ commit, y, trackColor, opacity, selected, head, dimmed, ...props }: DotProps) {
  const cx = xOf(commit.commitDate, props.viewport)
  const isMerge = commit.parents.length > 1
  return (
    <CommitMenu repo={props.repoPath} commit={commit}>
      <g
        role="option"
        aria-selected={selected}
        aria-label={`${commit.subject}, ${shortSha(commit.sha)}`}
        data-testid="timeline-commit"
        data-sha={commit.sha}
        className="cursor-pointer"
        opacity={dimmed ? 0.25 * opacity : opacity}
        onClick={(event) => props.onSelect(commit.sha, event)}
        onDoubleClick={() => props.onOpen(commit.sha)}
        onMouseEnter={() => props.onHover({ x: cx, y, commits: [commit] })}
        onMouseLeave={() => props.onHover(null)}
      >
        {/* A bigger invisible circle makes small dots easier to hit. */}
        <circle cx={cx} cy={y} r={DOT_RADIUS + 4} fill="transparent" />
        {(selected || head) && (
          <circle
            cx={cx}
            cy={y}
            r={DOT_RADIUS + 3}
            fill="none"
            strokeWidth={2}
            className={selected ? 'stroke-brand' : 'stroke-foreground'}
            strokeOpacity={selected ? 1 : 0.5}
          />
        )}
        <circle
          cx={cx}
          cy={y}
          r={DOT_RADIUS}
          // Merge commits are hollow, like in the vertical graph.
          fill={isMerge ? 'var(--background)' : color(trackColor)}
          stroke={color(trackColor)}
          strokeWidth={isMerge ? 2 : 0}
        />
      </g>
    </CommitMenu>
  )
}

interface ClusterProps extends TimelineCanvasProps {
  cluster: Cluster<Commit>
  y: number
  trackColor: number
  opacity: number
}

/** Several commits too close to draw apart: a pill with a count. */
function ClusterPill({ cluster, y, trackColor, opacity, ...props }: ClusterProps) {
  const { items } = cluster
  const containsSelected = items.some((c) => c.sha === props.selectedSha)
  const matching = props.matches ? items.filter((c) => props.matches!.has(c.sha)).length : null
  const label = String(items.length)
  // Wide enough for the count.
  const pad = DOT_RADIUS + 1
  const minWidth = label.length * 6 + 8
  const mid = (cluster.x1 + cluster.x2) / 2
  const left = Math.min(cluster.x1 - pad, mid - minWidth / 2)
  const right = Math.max(cluster.x2 + pad, mid + minWidth / 2)
  const first = items[0]!
  const last = items[items.length - 1]!
  return (
    <g
      role="option"
      aria-selected={containsSelected}
      aria-label={`${items.length} commits`}
      data-testid="timeline-cluster"
      className="cursor-zoom-in"
      opacity={matching === 0 ? 0.25 * opacity : opacity}
      onClick={(event) => {
        // Commits made in the same moment (e.g. by a rebase) can't be drawn
        // apart at any zoom: select the newest instead of zooming in.
        if (last.commitDate - first.commitDate < items.length * 60_000) {
          props.onSelect(last.sha, event)
        } else {
          props.onZoomTo(first.commitDate, last.commitDate)
        }
      }}
      onMouseEnter={() => props.onHover({ x: mid, y, commits: items })}
      onMouseLeave={() => props.onHover(null)}
    >
      <rect
        x={left}
        y={y - 7}
        width={right - left}
        height={14}
        rx={7}
        fill={color(trackColor)}
        className={containsSelected ? 'stroke-brand' : undefined}
        strokeWidth={containsSelected ? 2 : 0}
      />
      <text
        x={mid}
        y={y + 3.5}
        textAnchor="middle"
        className="pointer-events-none fill-background text-[10px] font-semibold"
      >
        {label}
      </text>
    </g>
  )
}
