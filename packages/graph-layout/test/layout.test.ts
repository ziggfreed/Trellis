import { describe, expect, it } from 'vitest'
import { GraphLayout, layoutGraph, type GraphCommit } from '../src'
import { assertLayoutValid, randomHistory } from './random-history'

/** Shorthand: c('M', 'A', 'B') is commit M with parents A and B. */
const c = (sha: string, ...parents: string[]): GraphCommit => ({ sha, parents })

/** Drop colours so tests can focus on positions. */
const shape = (layout: GraphLayout) =>
  layout.rows.map((r) => ({
    lane: r.lane,
    top: r.top.map((e) => [e.from, e.to]),
    bottom: r.bottom.map((e) => [e.from, e.to]),
  }))

describe('layoutGraph', () => {
  it('puts a linear history in one straight lane', () => {
    const layout = layoutGraph([c('C', 'B'), c('B', 'A'), c('A')])
    expect(shape(layout)).toEqual([
      { lane: 0, top: [], bottom: [[0, 0]] }, // tip: nothing above
      { lane: 0, top: [[0, 0]], bottom: [[0, 0]] },
      { lane: 0, top: [[0, 0]], bottom: [] }, // first commit: nothing below
    ])
    expect(layout.width).toBe(1)
    // One branch, one colour.
    expect(new Set(layout.rows.map((r) => r.color)).size).toBe(1)
  })

  it('draws a merge as a lane that splits off and joins back', () => {
    // The example from the comment at the top of layout.ts.
    const layout = layoutGraph([c('M', 'A2', 'B1'), c('A2', 'A1'), c('B1', 'A1'), c('A1')])
    expect(shape(layout)).toEqual([
      {
        lane: 0,
        top: [],
        bottom: [
          [0, 0],
          [0, 1],
        ],
      },
      {
        lane: 0,
        top: [
          [0, 0],
          [1, 1],
        ],
        bottom: [
          [1, 1],
          [0, 0],
        ],
      },
      {
        lane: 1,
        top: [
          [0, 0],
          [1, 1],
        ],
        bottom: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        lane: 0,
        top: [
          [0, 0],
          [1, 0],
        ],
        bottom: [],
      },
    ])
    expect(layout.width).toBe(2)
    // The merged branch gets its own colour.
    expect(layout.rows[2]!.color).not.toBe(layout.rows[1]!.color)
  })

  it('gives two branch tips with the same parent separate lanes that meet at the parent', () => {
    const layout = layoutGraph([c('X', 'A'), c('Y', 'A'), c('A')])
    expect(layout.rows.map((r) => r.lane)).toEqual([0, 1, 0])
    expect(layout.rows[2]!.top.map((e) => [e.from, e.to])).toEqual([
      [0, 0],
      [1, 0],
    ])
  })

  it('joins an existing lane when a merge parent is already being tracked', () => {
    // B's lane already leads to A when M (merging A) is reached.
    const layout = layoutGraph([c('B', 'A'), c('M', 'Z', 'A'), c('Z', 'A'), c('A')])
    expect(layout.rows[1]!.bottom).toContainEqual(expect.objectContaining({ from: 1, to: 0 }))
    assertLayoutValid([c('B', 'A'), c('M', 'Z', 'A'), c('Z', 'A'), c('A')], layout)
  })

  it('handles octopus merges (more than two parents)', () => {
    const commits = [c('M', 'A', 'B', 'C'), c('A', 'R'), c('B', 'R'), c('C', 'R'), c('R')]
    const layout = layoutGraph(commits)
    expect(layout.rows[0]!.bottom.map((e) => e.to)).toEqual([0, 1, 2])
    expect(layout.width).toBe(3)
    assertLayoutValid(commits, layout)
  })

  it('reuses a free lane for an unrelated history after a root commit', () => {
    const layout = layoutGraph([c('B', 'A'), c('A'), c('Y', 'X'), c('X')])
    expect(layout.rows.map((r) => r.lane)).toEqual([0, 0, 0, 0])
    expect(layout.rows[2]!.top).toEqual([]) // nothing connects Y to A
  })

  it('keeps lines going to parents that have not loaded yet', () => {
    const layout = layoutGraph([c('M', 'A', 'B')])
    expect(layout.rows[0]!.bottom.map((e) => e.to)).toEqual([0, 1])
  })
})

describe('GraphLayout.append', () => {
  it('gives the same result whether commits arrive in pages or all at once', () => {
    const commits = randomHistory(2000, 7)
    const paged = new GraphLayout()
    for (let i = 0; i < commits.length; i += 137) paged.append(commits.slice(i, i + 137))
    const whole = layoutGraph(commits)
    expect(paged.rows).toEqual(whole.rows)
    expect(paged.width).toBe(whole.width)
  })
})

describe('random histories', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('produces a valid layout (seed %i)', (seed) => {
    const commits = randomHistory(3000, seed)
    assertLayoutValid(commits, layoutGraph(commits))
  })

  it('catches a broken layout (checks the checker)', () => {
    const commits = [c('B', 'A'), c('A')]
    const layout = layoutGraph(commits)
    layout.rows[1]!.top = [] // remove the line from B to A
    expect(() => assertLayoutValid(commits, layout)).toThrow()
  })
})

describe('performance', () => {
  it('lays out 100,000 commits quickly', () => {
    const commits = randomHistory(100_000, 42)
    const start = performance.now()
    const layout = layoutGraph(commits)
    const elapsed = performance.now() - start
    expect(layout.rows).toHaveLength(100_000)
    // Typically well under 200 ms; the limit is generous for slow CI machines.
    expect(elapsed).toBeLessThan(2000)
    console.log(`layout of 100k commits: ${elapsed.toFixed(0)} ms, width ${layout.width}`)
  })
})
