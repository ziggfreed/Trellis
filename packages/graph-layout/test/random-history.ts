/**
 * Generates random but valid commit histories for testing the layout, plus
 * a checker that verifies a layout really connects every commit to its
 * parents.
 */
import type { GraphCommit, GraphLayout } from '../src'

/** Small seeded random number generator (mulberry32), so failures are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build a random history of `count` commits, newest first. Commits are
 * created oldest first, each choosing parents among earlier commits, so
 * reversing the creation order is always a valid topological order.
 */
export function randomHistory(count: number, seed = 1): GraphCommit[] {
  const random = seededRandom(seed)
  const commits: GraphCommit[] = []
  const pick = (window: number) =>
    commits[Math.max(0, commits.length - 1 - Math.floor(random() * window))]!.sha

  for (let i = 0; i < count; i++) {
    const sha = `c${i}`
    const roll = random()
    let parents: string[]
    if (i === 0 || roll < 0.01)
      parents = [] // a root (first commit or orphan branch)
    else if (roll < 0.15)
      parents = [...new Set([pick(20), pick(40)])] // merge
    else if (roll < 0.16)
      parents = [...new Set([pick(10), pick(30), pick(60)])] // octopus merge
    else if (roll < 0.35)
      parents = [pick(30)] // branch off an older commit
    else parents = [commits[i - 1]!.sha] // continue the previous commit
    commits.push({ sha, parents })
  }
  return commits.reverse()
}

/**
 * Replay the drawn lines and check they match the history:
 * - every line entering a row continues a line that left the row above,
 * - lines into a commit's dot come exactly from lanes leading to it,
 * - the dot has one line per parent, and each line leads to that parent,
 * - nothing is drawn outside the graph's width.
 * Throws a descriptive error on the first problem found.
 */
export function assertLayoutValid(commits: GraphCommit[], layout: GraphLayout): void {
  /** lane -> commit that the line in that lane leads to */
  const waiting = new Map<number, string>()

  commits.forEach((commit, index) => {
    const row = layout.rows[index]!
    const where = `row ${index} (${commit.sha})`
    const fail = (message: string) => {
      throw new Error(`${where}: ${message}`)
    }

    // Top half: exactly one line from each lane that was running.
    const topFrom = row.top.map((e) => e.from).sort((a, b) => a - b)
    const running = [...waiting.keys()].sort((a, b) => a - b)
    if (JSON.stringify(topFrom) !== JSON.stringify(running)) {
      fail(`top lines start at ${topFrom} but running lanes are ${running}`)
    }
    for (const edge of row.top) {
      const target = waiting.get(edge.from)
      const expected = target === commit.sha ? row.lane : edge.from
      if (edge.to !== expected) fail(`line from lane ${edge.from} should end at ${expected}`)
      if (target === commit.sha) waiting.delete(edge.from)
    }
    if (waiting.has(row.lane)) fail(`dot placed in lane ${row.lane}, which leads elsewhere`)

    // Bottom half: pass-through lines for every other running lane...
    const passing = row.bottom.filter((e) => e.from !== row.lane)
    for (const edge of passing) {
      if (edge.from !== edge.to || !waiting.has(edge.from))
        fail(`unexpected line ${edge.from}->${edge.to}`)
    }
    if (passing.length !== waiting.size) fail('a running lane has no line through this row')

    // ...and one line from the dot per parent, in parent order.
    const fromDot = row.bottom.filter((e) => e.from === row.lane)
    if (fromDot.length !== commit.parents.length) {
      fail(`${fromDot.length} lines leave the dot but it has ${commit.parents.length} parents`)
    }
    fromDot.forEach((edge, i) => {
      const parent = commit.parents[i]!
      const current = waiting.get(edge.to)
      if (current !== undefined && current !== parent) {
        fail(`line to parent ${parent} joins lane ${edge.to}, which leads to ${current}`)
      }
      waiting.set(edge.to, parent)
    })

    const lanesUsed = [row.lane, ...row.top.map((e) => e.from), ...row.bottom.map((e) => e.to)]
    if (Math.max(...lanesUsed) >= layout.width) fail('drawn outside the graph width')
  })
}
