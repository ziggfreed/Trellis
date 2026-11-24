import { describe, expect, it } from 'vitest'
import { layoutGraph } from '@trellis/graph-layout'
import type { Commit, LogPage } from '@shared/ipc'
import { IncrementalLayout } from './incremental-layout'

const commit = (sha: string, ...parents: string[]): Commit => ({
  sha,
  parents,
  authorName: '',
  authorEmail: '',
  authorDate: 0,
  committerName: '',
  committerEmail: '',
  commitDate: 0,
  subject: sha,
  body: '',
})
const page = (...commits: Commit[]): LogPage => ({ commits, hasMore: true })

describe('IncrementalLayout', () => {
  const p1 = page(commit('D', 'C', 'X'), commit('C', 'B'))
  const p2 = page(commit('X', 'B'), commit('B', 'A'))
  const p3 = page(commit('A'))
  const all = [...p1.commits, ...p2.commits, ...p3.commits]

  it('matches a full layout when pages are appended one by one', () => {
    const incremental = new IncrementalLayout()
    incremental.update([p1])
    incremental.update([p1, p2])
    const result = incremental.update([p1, p2, p3])
    expect(result.rows).toEqual(layoutGraph(all).rows)
    expect(result.width).toBe(2)
  })

  it('starts again when earlier pages are replaced', () => {
    const incremental = new IncrementalLayout()
    incremental.update([p1, p2])
    const reloaded = [page(commit('Z', 'A')), p3]
    expect(incremental.update(reloaded).rows).toEqual(
      layoutGraph([commit('Z', 'A'), commit('A')]).rows,
    )
  })
})
