/**
 * The strip under the timeline showing all the loaded history at once: bars
 * for how many commits were made when, and a box for the part on screen.
 *
 * Drag the box to scroll, drag its edges to zoom, click elsewhere to jump
 * there, or use the mouse wheel to zoom. With the keyboard: ←/→ scroll,
 * +/- zoom.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { densityBuckets, MIN_MS_PER_PX, type Domain, type Viewport } from './time-scale'

export const MINIMAP_HEIGHT = 40
/** Width of each bar, in pixels. */
const BAR_WIDTH = 3
/** How close to the box's edge (in pixels) a drag resizes rather than moves it. */
const EDGE_GRAB = 5

interface TimelineMinimapProps {
  domain: Domain
  viewport: Viewport
  /** Width of the main timeline, to know how much time it shows. */
  viewWidth: number
  /** Commit dates to count. */
  times: readonly number[]
  onChange: (viewport: Viewport) => void
}

type Drag = { kind: 'move'; offset: number } | { kind: 'left' | 'right'; fixed: number }

export function TimelineMinimap({
  domain,
  viewport,
  viewWidth,
  times,
  onChange,
}: TimelineMinimapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const span = Math.max(1, domain.end - domain.start)
  const msPerPx = span / Math.max(1, width)
  const toX = (time: number) => (time - domain.start) / msPerPx
  const toTime = (px: number) => domain.start + px * msPerPx

  const buckets = useMemo(
    () => densityBuckets(times, domain, Math.floor(width / BAR_WIDTH)),
    [times, domain, width],
  )
  // Square root, so one busy day doesn't flatten every other bar.
  const tallest = Math.sqrt(Math.max(1, ...buckets))

  const viewStart = viewport.start
  const viewEnd = viewport.start + viewWidth * viewport.msPerPx
  const boxLeft = Math.max(0, toX(viewStart))
  const boxRight = Math.min(width, Math.max(boxLeft + 4, toX(viewEnd)))

  const pointerTime = (event: React.PointerEvent) =>
    toTime(event.clientX - ref.current!.getBoundingClientRect().left)

  /** Show `start`..`end` in the main view. */
  const show = (start: number, end: number) =>
    onChange({ start, msPerPx: Math.max(MIN_MS_PER_PX, (end - start) / Math.max(1, viewWidth)) })

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const px = event.clientX - ref.current!.getBoundingClientRect().left
    const time = toTime(px)
    if (Math.abs(px - boxLeft) <= EDGE_GRAB) drag.current = { kind: 'left', fixed: viewEnd }
    else if (Math.abs(px - boxRight) <= EDGE_GRAB)
      drag.current = { kind: 'right', fixed: viewStart }
    else if (px > boxLeft && px < boxRight)
      drag.current = { kind: 'move', offset: time - viewStart }
    else {
      // Clicked outside the box: centre the view there, then keep dragging.
      const half = (viewEnd - viewStart) / 2
      onChange({ start: time - half, msPerPx: viewport.msPerPx })
      drag.current = { kind: 'move', offset: half }
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const current = drag.current
    if (!current) return
    const time = pointerTime(event)
    if (current.kind === 'move')
      onChange({ start: time - current.offset, msPerPx: viewport.msPerPx })
    else if (current.kind === 'left')
      show(Math.min(time, current.fixed - MIN_MS_PER_PX * 50), current.fixed)
    else show(current.fixed, Math.max(time, current.fixed + MIN_MS_PER_PX * 50))
  }

  const onWheel = (event: React.WheelEvent) => {
    // Zoom around the middle of what's on screen.
    const factor = event.deltaY > 0 ? 1.25 : 0.8
    const middle = (viewStart + viewEnd) / 2
    const half = ((viewEnd - viewStart) / 2) * factor
    show(middle - half, middle + half)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const length = viewEnd - viewStart
    const moves: Record<string, () => void> = {
      ArrowLeft: () => onChange({ ...viewport, start: viewStart - length / 4 }),
      ArrowRight: () => onChange({ ...viewport, start: viewStart + length / 4 }),
      '+': () => show(viewStart + length / 8, viewEnd - length / 8),
      '=': () => show(viewStart + length / 8, viewEnd - length / 8),
      '-': () => show(viewStart - length / 4, viewEnd + length / 4),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    move()
  }

  // Where the view is, as a percentage through the history (for screen readers).
  const position = Math.round(Math.min(100, Math.max(0, ((viewEnd - domain.start) / span) * 100)))

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Timeline overview"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={position}
      aria-valuetext={`${new Date(viewStart).toLocaleDateString()} to ${new Date(viewEnd).toLocaleDateString()}`}
      data-testid="timeline-minimap"
      className="relative h-full min-w-0 flex-1 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (drag.current = null)}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <svg width={width} height={MINIMAP_HEIGHT} className="block">
        {buckets.map((count, i) =>
          count === 0 ? null : (
            <rect
              key={i}
              x={i * BAR_WIDTH}
              width={BAR_WIDTH - 1}
              y={MINIMAP_HEIGHT - 4 - (Math.sqrt(count) / tallest) * (MINIMAP_HEIGHT - 10)}
              height={(Math.sqrt(count) / tallest) * (MINIMAP_HEIGHT - 10)}
              className="fill-muted-foreground"
              opacity={0.45}
            />
          ),
        )}
        <rect
          x={boxLeft}
          y={1}
          width={boxRight - boxLeft}
          height={MINIMAP_HEIGHT - 2}
          rx={3}
          className="fill-brand stroke-brand"
          fillOpacity={0.12}
          strokeWidth={1.5}
          data-testid="timeline-minimap-window"
        />
        {/* Grips on the box's edges, to show they can be dragged. */}
        {[boxLeft, boxRight].map((edge, i) => (
          <line
            key={i}
            x1={edge}
            x2={edge}
            y1={12}
            y2={MINIMAP_HEIGHT - 12}
            className="stroke-brand"
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  )
}
