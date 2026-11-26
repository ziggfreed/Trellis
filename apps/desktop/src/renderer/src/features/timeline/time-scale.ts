/**
 * The timeline's time axis: converting between dates and pixels, zooming
 * and panning, the date labels along the top, grouping dots that would
 * overlap, and the commit counts drawn in the minimap.
 *
 * What's on screen is described by a `Viewport`: the date at the left edge
 * and how many milliseconds one pixel stands for. Zooming changes
 * `msPerPx`; panning changes `start`.
 */

export interface Viewport {
  /** Date at the left edge (Unix ms). */
  start: number
  /** Milliseconds per pixel: bigger means more zoomed out. */
  msPerPx: number
}

/** The loaded range of history (Unix ms). */
export interface Domain {
  start: number
  end: number
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Most zoomed in: 1 pixel = 20 seconds (an hour is 180px). */
export const MIN_MS_PER_PX = 20 * 1000
/** Most zoomed out: 1 pixel = 10 days. */
export const MAX_MS_PER_PX = 10 * DAY

export const xOf = (time: number, viewport: Viewport) => (time - viewport.start) / viewport.msPerPx
export const timeAt = (x: number, viewport: Viewport) => viewport.start + x * viewport.msPerPx

/**
 * Zoom by `factor` (2 = twice as close) keeping the date under `anchorX`
 * where it is, so the zoom follows the pointer.
 */
export function zoomAt(viewport: Viewport, factor: number, anchorX: number): Viewport {
  const msPerPx = Math.min(MAX_MS_PER_PX, Math.max(MIN_MS_PER_PX, viewport.msPerPx / factor))
  const anchor = timeAt(anchorX, viewport)
  return { start: anchor - anchorX * msPerPx, msPerPx }
}

/**
 * Keep the view near the loaded history: the right edge can go a little
 * past `domain.end` (so the newest commit isn't stuck to the edge) and the
 * left edge a little before `domain.start`, or freely before it when older
 * history can still be loaded (scrolling there loads it).
 */
export function clampViewport(
  viewport: Viewport,
  width: number,
  domain: Domain,
  canLoadMore: boolean,
): Viewport {
  const slack = width * 0.25 * viewport.msPerPx
  const maxStart = domain.end + slack - width * viewport.msPerPx
  const minStart = canLoadMore ? -Infinity : domain.start - slack
  // If the whole domain fits on screen, prefer keeping the newest end in view.
  const start = Math.max(minStart, Math.min(maxStart, viewport.start))
  return { start, msPerPx: viewport.msPerPx }
}

/** A view showing `from`..`to` across `width` pixels, with a margin at each side. */
export function viewportFor(from: number, to: number, width: number, margin = 24): Viewport {
  const usable = Math.max(1, width - margin * 2)
  const msPerPx = Math.min(MAX_MS_PER_PX, Math.max(MIN_MS_PER_PX, (to - from) / usable))
  return { start: from - margin * msPerPx, msPerPx }
}

/** One step of the date axis: how to round down to it and move to the next. */
interface TickUnit {
  /** Roughly how long one step is, to pick a unit that fits. */
  size: number
  floor: (date: Date) => Date
  next: (date: Date) => Date
  format: Intl.DateTimeFormatOptions
}

const atHours = (step: number): TickUnit => ({
  size: step * HOUR,
  floor: (d) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - (d.getHours() % step)),
  next: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + step),
  format: { hour: 'numeric', minute: '2-digit' },
})

const atMonths = (step: number): TickUnit => ({
  size: step * 30 * DAY,
  floor: (d) => new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % step), 1),
  next: (d) => new Date(d.getFullYear(), d.getMonth() + step, 1),
  format: { month: 'short', year: 'numeric' },
})

/** Units from finest to coarsest. Dates are local, so days start at local midnight. */
const UNITS: TickUnit[] = [
  atHours(1),
  atHours(3),
  atHours(6),
  atHours(12),
  {
    size: DAY,
    floor: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    next: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
    format: { month: 'short', day: 'numeric' },
  },
  {
    // Weeks start on Monday.
    size: 7 * DAY,
    floor: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)),
    next: (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7),
    format: { month: 'short', day: 'numeric' },
  },
  atMonths(1),
  atMonths(3),
  {
    size: 365 * DAY,
    floor: (d) => new Date(d.getFullYear(), 0, 1),
    next: (d) => new Date(d.getFullYear() + 1, 0, 1),
    format: { year: 'numeric' },
  },
]

export interface Tick {
  time: number
  label: string
  /** True at the start of a day (for hour ticks), so it can be emphasised. */
  major: boolean
}

/**
 * Date labels for the axis: the finest unit whose labels are at least
 * `minSpacing` pixels apart, from the left edge to `width`.
 */
export function axisTicks(viewport: Viewport, width: number, minSpacing = 90): Tick[] {
  const unit =
    UNITS.find((u) => u.size / viewport.msPerPx >= minSpacing) ?? UNITS[UNITS.length - 1]!
  const formatter = new Intl.DateTimeFormat(undefined, unit.format)
  const dayFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const end = timeAt(width, viewport)
  const ticks: Tick[] = []
  for (let d = unit.floor(new Date(viewport.start)); d.getTime() <= end; d = unit.next(d)) {
    if (d.getTime() < viewport.start - unit.size) continue
    // For hour ticks, label midnight with the date instead of "12:00 AM".
    const midnight = unit.size < DAY && d.getHours() === 0
    ticks.push({
      time: d.getTime(),
      label: (midnight ? dayFormatter : formatter).format(d),
      major: midnight,
    })
    if (ticks.length > 500) break // safety net; never reached in practice
  }
  return ticks
}

/** Dots close enough to overlap, drawn as one group. */
export interface Cluster<T> {
  items: T[]
  /** x of the first and last item. */
  x1: number
  x2: number
}

/**
 * Group items (sorted by x) whose x is within `gap` pixels of the previous
 * one. Far apart dots stay single; a burst of commits becomes one cluster.
 */
export function clusterByX<T>(items: readonly T[], xOfItem: (item: T) => number, gap: number) {
  const clusters: Cluster<T>[] = []
  for (const item of items) {
    const x = xOfItem(item)
    const last = clusters.at(-1)
    if (last && x - last.x2 < gap) {
      last.items.push(item)
      last.x2 = Math.max(last.x2, x)
    } else {
      clusters.push({ items: [item], x1: x, x2: x })
    }
  }
  return clusters
}

/** How many of `times` fall in each of `count` equal slices of `domain`. */
export function densityBuckets(times: readonly number[], domain: Domain, count: number): number[] {
  const buckets = new Array<number>(Math.max(1, count)).fill(0)
  const span = Math.max(1, domain.end - domain.start)
  for (const time of times) {
    const i = Math.floor(((time - domain.start) / span) * buckets.length)
    if (i >= 0 && i < buckets.length) buckets[i]!++
    else if (time === domain.end) buckets[buckets.length - 1]!++ // exactly at the end
  }
  return buckets
}
