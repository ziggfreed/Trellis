/**
 * Draws the commit graph for ONE row of the history list as a small SVG.
 *
 * The layout (from @trellis/graph-layout) says which lane the dot is in and
 * which lines cross the top and bottom halves of the row. Lines between
 * different lanes are drawn as smooth S-curves; lines in the same lane are
 * straight. Colours come from the --graph-N CSS variables.
 */
import { memo } from 'react'
import type { GraphEdge, GraphRow } from '@trellis/graph-layout'

/** Horizontal space per lane, in pixels. */
export const LANE_WIDTH = 14
const DOT_RADIUS = 4
const LINE_WIDTH = 2
const PALETTE_SIZE = 8

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2
const laneColor = (color: number) => `var(--graph-${color % PALETTE_SIZE})`

/** SVG path for a line between y1 and y2, curving if it changes lane. */
function edgePath(edge: GraphEdge, y1: number, y2: number): string {
  const x1 = laneX(edge.from)
  const x2 = laneX(edge.to)
  if (x1 === x2) return `M${x1} ${y1}V${y2}`
  const mid = (y1 + y2) / 2
  return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
}

interface GraphCellProps {
  row: GraphRow
  /** Number of lanes to make room for (the whole graph's width). */
  lanes: number
  height: number
  /** Merge commits get a hollow dot. */
  isMerge: boolean
  /** The checked-out commit gets a ring around its dot. */
  isHead: boolean
}

export const GraphCell = memo(function GraphCell({
  row,
  lanes,
  height,
  isMerge,
  isHead,
}: GraphCellProps) {
  const middle = height / 2
  const color = laneColor(row.color)
  const cx = laneX(row.lane)
  return (
    <svg
      width={lanes * LANE_WIDTH}
      height={height}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <g fill="none" strokeWidth={LINE_WIDTH} strokeLinecap="round">
        {row.top.map((edge, i) => (
          <path key={`t${i}`} d={edgePath(edge, 0, middle)} stroke={laneColor(edge.color)} />
        ))}
        {row.bottom.map((edge, i) => (
          <path key={`b${i}`} d={edgePath(edge, middle, height)} stroke={laneColor(edge.color)} />
        ))}
      </g>
      {isHead && (
        <circle
          cx={cx}
          cy={middle}
          r={DOT_RADIUS + 3}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      )}
      <circle
        cx={cx}
        cy={middle}
        r={DOT_RADIUS}
        fill={isMerge ? 'var(--background)' : color}
        stroke={color}
        strokeWidth={isMerge ? LINE_WIDTH : 0}
      />
    </svg>
  )
})
