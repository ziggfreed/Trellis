import { afterEach, describe, expect, it } from 'vitest'
import { getLog, LogReader } from '../src'
import { addLinearCommits, createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
const readers: LogReader[] = []
afterEach(async () => {
  readers.splice(0).forEach((r) => r.dispose())
  await repo?.cleanup()
  repo = undefined
})
function reader(path: string, scope?: 'all' | 'local' | 'head') {
  const r = new LogReader(path, scope)
  readers.push(r)
  return r
}

describe('LogReader', () => {
  it('returns the same commits as getLog, page by page', async () => {
    repo = await createTempRepo()
    await addLinearCommits(repo, 1234)
    const r = reader(repo.path)

    const all = []
    let skip = 0
    for (;;) {
      const page = await r.getPage(skip, 500)
      all.push(...page.commits)
      skip += page.commits.length
      if (!page.hasMore) break
    }
    expect(all).toHaveLength(1234)
    expect(all).toEqual(await getLog(repo.path, { limit: 5000 }))
    expect(all[0]?.subject).toBe('commit 1234')
  })

  it('serves a page deep in history (resuming after pausing)', async () => {
    repo = await createTempRepo()
    await addLinearCommits(repo, 6000)
    const r = reader(repo.path)
    expect((await r.getPage(0, 10)).commits[0]?.subject).toBe('commit 6000')
    // Well past the read-ahead limit, so git must have been paused and resumed.
    const deep = await r.getPage(5990, 100)
    expect(deep.commits.map((c) => c.subject).at(-1)).toBe('commit 1')
    expect(deep.commits).toHaveLength(10)
    expect(deep.hasMore).toBe(false)
  })

  it('handles an empty repository', async () => {
    repo = await createTempRepo()
    expect(await reader(repo.path).getPage(0, 100)).toEqual({ commits: [], hasMore: false })
  })

  it('reports hasMore correctly at an exact page boundary', async () => {
    repo = await createTempRepo()
    await addLinearCommits(repo, 10)
    const r = reader(repo.path)
    expect((await r.getPage(0, 10)).hasMore).toBe(false)
    expect((await r.getPage(0, 9)).hasMore).toBe(true)
  })

  it('rejects waiting requests when disposed', async () => {
    repo = await createTempRepo()
    await addLinearCommits(repo, 10)
    const r = new LogReader(repo.path)
    const page = r.getPage(0, 10)
    r.dispose()
    await expect(page).rejects.toThrow('closed')
  })

  it('respects the scope', async () => {
    repo = await createTempRepo()
    await addLinearCommits(repo, 3)
    await repo.git('switch', '-q', '-c', 'side')
    await repo.write('side.txt', 'x')
    await repo.commit('on side')
    await repo.git('switch', '-q', 'main')
    const all = await reader(repo.path, 'all').getPage(0, 100)
    const head = await reader(repo.path, 'head').getPage(0, 100)
    expect(all.commits.map((c) => c.subject)).toContain('on side')
    expect(head.commits.map((c) => c.subject)).not.toContain('on side')
  })
})
