/**
 * Commit graph layout.
 *
 * INPUT: commits in topological order, newest first (every child appears
 * before its parents), as produced by `git log --topo-order`.
 *
 * OUTPUT: one GraphRow per commit, telling the renderer:
 *   - which column ("lane") the commit's dot goes in,
 *   - which lines to draw in the top half of the row (coming down from the
 *     row above into this row's middle), and
 *   - which lines to draw in the bottom half (from the middle down to the
 *     row below).
 *
 * Splitting every row into a top and bottom half means each row can be
 * drawn on its own, which is what lets the UI render only the visible rows.
 *
 * HOW IT WORKS
 * We walk the commits in order and keep a list of active lanes. Each lane
 * remembers which commit it is waiting for: the parent of the last commit
 * drawn in it. For each commit:
 *
 *   1. Find the lanes waiting for this commit (its children's lines).
 *      - None: it's a branch tip, so it gets a free lane (a new colour).
 *      - One or more: it goes in the leftmost; the others end here, with a
 *        line curving into it (branches that started from this commit).
 *   2. Its first parent continues in the same lane (same colour), so a
 *      branch's first-parent history stays in a straight line.
 *   3. Each extra parent of a merge commit:
 *      - if a lane is already waiting for that parent, draw a line into it;
 *      - otherwise start a new lane (new colour) for it.
 *   4. A commit with no parents (the first commit) ends its lane.
 *
 * Lanes keep their column for their whole life, so lines stay straight;
 * empty columns are reused by later branches.
 *
 * PINNING THE CURRENT BRANCH
 * With `pinned` set (the checked-out commit), lane 0 is kept free until
 * that commit appears, and the commit then goes in lane 0 even if newer
 * branches were drawn first. Its first-parent history then continues down
 * lane 0 as usual, so the current branch is always the leftmost line.
 *
 * Example (lanes shown as columns, ● = commit):
 *
 *     ●        merge M, parents A2 and B1   lane 0; starts lane 1 for B1
 *     │╲
 *     ● │      A2 (waited for by lane 0)
 *     │ ●      B1 (waited for by lane 1)
 *     │╱
 *     ●        A1: both lanes wait for it; lane 1 curves into lane 0
 */

export interface GraphCommit {
  sha: string
  parents: string[]
}

/** A line in one half of a row, between two lanes (columns). */
export interface GraphEdge {
  /** Lane at the top of this half of the row. */
  from: number
  /** Lane at the bottom of this half of the row. */
  to: number
  /** Colour index; the renderer picks a colour with `color % paletteSize`. */
  color: number
}

export interface GraphRow {
  /** Lane (column) of this commit's dot. */
  lane: number
  /** Colour index of the dot. */
  color: number
  /** Lines from the top edge of the row to its middle. */
  top: GraphEdge[]
  /** Lines from the middle of the row to its bottom edge. */
  bottom: GraphEdge[]
}

/** Marks lane 0 as held for the pinned commit (see "Pinning" above). */
const RESERVED = '\0reserved'

export interface GraphLayoutOptions {
  /** Commit to draw in the leftmost lane, with its first-parent history (usually HEAD). */
  pinned?: string | null
}

/**
 * Builds the layout incrementally: call `append` with each page of commits
 * as it loads. Appending in several pages gives exactly the same result as
 * appending everything at once.
 */
export class GraphLayout {
  readonly rows: GraphRow[] = []
  /** The most lanes used by any row so far (the graph's width in columns). */
  width = 0

  /** For each lane: the commit hash it is waiting for, or null if the lane is free. */
  private lanes: (string | null)[] = []
  /** For each lane: its colour index. */
  private laneColors: number[] = []
  private nextColor = 0
  private readonly pinned: string | null

  constructor(options: GraphLayoutOptions = {}) {
    this.pinned = options.pinned ?? null
    if (this.pinned) {
      this.lanes.push(RESERVED)
      this.laneColors.push(this.nextColor++)
    }
  }

  append(commits: readonly GraphCommit[]): void {
    for (const commit of commits) this.rows.push(this.place(commit))
  }

  private place(commit: GraphCommit): GraphRow {
    const lanes = this.lanes
    const colors = this.laneColors
    const top: GraphEdge[] = []
    const bottom: GraphEdge[] = []

    // 1. Find the lanes waiting for this commit.
    const waiting: number[] = []
    lanes.forEach((sha, i) => sha === commit.sha && waiting.push(i))

    let lane: number
    if (commit.sha === this.pinned && lanes[0] === RESERVED) {
      // The pinned commit takes the lane held for it; any lanes waiting for
      // it (newer branches built on top) curve in from the right.
      lane = 0
    } else if (waiting.length > 0) {
      lane = waiting[0]!
    } else {
      lane = this.allocateLane()
      colors[lane] = this.nextColor++
    }
    const color = colors[lane]!

    // Top half: lanes waiting for this commit curve into its dot; every other
    // active lane passes straight through.
    lanes.forEach((sha, i) => {
      if (sha === null || sha === RESERVED) return
      top.push({ from: i, to: sha === commit.sha ? lane : i, color: colors[i]! })
    })
    // Lanes that merged into this commit (other than its own) are now free.
    for (const i of waiting) lanes[i] = null

    // 2-4. Parents. `fromDot` collects the lines leaving the dot downwards;
    // `started` collects lanes that begin at this commit (as opposed to lanes
    // that were already running and just pass by).
    const [firstParent, ...otherParents] = commit.parents
    const fromDot: GraphEdge[] = []
    const started = new Set<number>()

    lanes[lane] = firstParent ?? null
    if (firstParent !== undefined) {
      fromDot.push({ from: lane, to: lane, color })
      started.add(lane)
    }

    for (const parent of otherParents) {
      const existing = lanes.indexOf(parent)
      if (existing !== -1) {
        // Another lane already leads to this parent: draw a line into it.
        fromDot.push({ from: lane, to: existing, color: colors[existing]! })
      } else {
        const newLane = this.allocateLane()
        lanes[newLane] = parent
        colors[newLane] = this.nextColor++
        fromDot.push({ from: lane, to: newLane, color: colors[newLane]! })
        started.add(newLane)
      }
    }

    // Bottom half: every lane that was already running passes straight
    // through, then the lines leaving the dot.
    lanes.forEach((sha, i) => {
      if (sha !== null && sha !== RESERVED && !started.has(i)) bottom.push({ from: i, to: i, color: colors[i]! })
    })
    bottom.push(...fromDot)

    this.trimLanes()
    for (const edge of top) this.width = Math.max(this.width, edge.from + 1)
    for (const edge of bottom) this.width = Math.max(this.width, edge.to + 1)
    this.width = Math.max(this.width, lane + 1)
    return { lane, color, top, bottom }
  }

  /** The first free lane, or a new one at the right. */
  private allocateLane(): number {
    const free = this.lanes.indexOf(null)
    if (free !== -1) return free
    this.lanes.push(null)
    return this.lanes.length - 1
  }

  /** Drop free lanes at the right edge so the graph doesn't stay wide. */
  private trimLanes(): void {
    while (this.lanes.length > 0 && this.lanes.at(-1) === null) this.lanes.pop()
    this.laneColors.length = this.lanes.length
  }
}

/** Convenience: lay out a complete list of commits in one go. */
export function layoutGraph(commits: readonly GraphCommit[]): GraphLayout {
  const layout = new GraphLayout()
  layout.append(commits)
  return layout
}
