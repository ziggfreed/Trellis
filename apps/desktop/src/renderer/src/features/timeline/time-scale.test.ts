import { describe, expect, it } from 'vitest'
import {
  MAX_MS_PER_PX,
  MIN_MS_PER_PX,
  axisTicks,
  clampViewport,
  clusterByX,
  densityBuckets,
  timeAt,
  viewportFor,
  xOf,
  zoomAt,
} from './time-scale'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('viewport maths', () => {
  it('converts between dates and pixels', () => {
    const viewport = { start: 1000, msPerPx: 10 }
    expect(xOf(2000, viewport)).toBe(100)
    expect(timeAt(100, viewport)).toBe(2000)
  })

  it('zooms around the pointer, within limits', () => {
    const viewport = { start: 0, msPerPx: HOUR }
    const zoomed = zoomAt(viewport, 2, 100)
    expect(zoomed.msPerPx).toBe(HOUR / 2)
    // The date under the pointer stays under the pointer.
    expect(timeAt(100, zoomed)).toBe(timeAt(100, viewport))
    expect(zoomAt(viewport, 1e9, 0).msPerPx).toBe(MIN_MS_PER_PX)
    expect(zoomAt(viewport, 1e-9, 0).msPerPx).toBe(MAX_MS_PER_PX)
  })

  it('fits a period into a width with margins', () => {
    const viewport = viewportFor(0, 1000 * HOUR, 1048, 24)
    expect(viewport.msPerPx).toBe((1000 * HOUR) / 1000)
    expect(xOf(0, viewport)).toBeCloseTo(24)
    expect(xOf(1000 * HOUR, viewport)).toBeCloseTo(1024)
  })

  it('keeps the view near the loaded history, unless more can load', () => {
    const domain = { start: 0, end: 1000 * HOUR }
    const viewport = { start: -5000 * HOUR, msPerPx: HOUR }
    expect(clampViewport(viewport, 100, domain, false).start).toBe(-25 * HOUR)
    expect(clampViewport(viewport, 100, domain, true).start).toBe(-5000 * HOUR)
    const late = clampViewport({ start: 5000 * HOUR, msPerPx: HOUR }, 100, domain, false)
    expect(timeAt(100, late)).toBe(1025 * HOUR)
  })
})

describe('axisTicks', () => {
  it('uses days when a day is wide enough, starting at local midnight', () => {
    const start = new Date(2026, 0, 5, 15).getTime()
    const ticks = axisTicks({ start, msPerPx: DAY / 100 }, 350)
    expect(ticks.map((t) => new Date(t.time).getDate())).toEqual([5, 6, 7, 8, 9])
    expect(new Date(ticks[1]!.time).getHours()).toBe(0)
  })

  it('uses months when zoomed out', () => {
    const start = new Date(2026, 0, 1).getTime()
    const ticks = axisTicks({ start, msPerPx: DAY / 4 }, 500)
    expect(ticks.map((t) => new Date(t.time).getMonth())).toEqual([0, 1, 2, 3, 4])
  })

  it('marks midnight when showing hours', () => {
    const start = new Date(2026, 0, 5, 20).getTime()
    const ticks = axisTicks({ start, msPerPx: HOUR / 100 }, 500)
    expect(ticks.find((t) => t.major)?.time).toBe(new Date(2026, 0, 6).getTime())
  })
})

describe('clusterByX', () => {
  it('groups items closer than the gap', () => {
    const clusters = clusterByX([0, 3, 5, 20, 40, 42], (x) => x, 6)
    expect(clusters.map((c) => c.items)).toEqual([[0, 3, 5], [20], [40, 42]])
    expect(clusters[0]).toMatchObject({ x1: 0, x2: 5 })
  })
})

describe('densityBuckets', () => {
  it('counts dates in equal slices', () => {
    expect(densityBuckets([0, 1, 5, 9, 10, 11, -1], { start: 0, end: 10 }, 2)).toEqual([2, 3])
  })
})
