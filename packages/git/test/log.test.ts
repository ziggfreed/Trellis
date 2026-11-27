import { afterEach, describe, expect, it } from 'vitest'
import { getLog, parseCommits, runGit } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let r: TempRepo | undefined
afterEach(async () => {
  await r?.cleanup()
  r = undefined
})

describe('parseCommits', () => {
  it('parses fields and multi-line bodies', () => {
    const record = [
      'abc',
      'p1 p2',
      'Ann',
      'a@x',
      '100',
      'Cid',
      'c@x',
      '200',
      'Subject',
      'Line 1\nLine 2\n',
    ]
    const [commit] = parseCommits(record.join('\x1f') + '\0')
    expect(commit).toEqual({
      sha: 'abc',
      parents: ['p1', 'p2'],
      authorName: 'Ann',
      authorEmail: 'a@x',
      authorDate: 100_000,
      committerName: 'Cid',
      committerEmail: 'c@x',
      commitDate: 200_000,
      subject: 'Subject',
      body: 'Line 1\nLine 2',
    })
  })

  it('handles root commits (no parents)', () => {
    const record = ['abc', '', 'A', 'a', '1', 'C', 'c', '1', 'S', '']
    expect(parseCommits(record.join('\x1f') + '\0')[0]?.parents).toEqual([])
  })
})

describe('getLog', () => {
  it('returns nothing for a repo with no commits', async () => {
    r = await createTempRepo()
    expect(await getLog(r.path)).toEqual([])
    expect(await getLog(r.path, { scope: 'head' })).toEqual([])
  })

  it('returns commits newest first with parents and messages', async () => {
    r = await createTempRepo()
    await r.write('a.txt', '1')
    const first = await r.commit('first')
    await r.write('a.txt', '2')
    await r.git('commit', '-am', 'second\n\nWith a body\nover two lines')
    const log = await getLog(r.path)
    expect(log.map((c) => c.subject)).toEqual(['second', 'first'])
    expect(log[0]).toMatchObject({ parents: [first], body: 'With a body\nover two lines' })
    expect(log[1]?.parents).toEqual([])
  })

  it('includes other branches with scope "all" but not with "head"', async () => {
    r = await createTempRepo()
    await r.write('a.txt', '1')
    await r.commit('base')
    await r.git('switch', '-c', 'feature')
    await r.write('b.txt', '1')
    await r.commit('on feature')
    await r.git('switch', 'main')
    expect((await getLog(r.path)).map((c) => c.subject)).toContain('on feature')
    expect((await getLog(r.path, { scope: 'head' })).map((c) => c.subject)).toEqual(['base'])
  })

  it('pages with limit and skip', async () => {
    r = await createTempRepo()
    for (let i = 1; i <= 5; i++) {
      await r.write('a.txt', String(i))
      await r.commit(`c${i}`)
    }
    const page = await getLog(r.path, { limit: 2, skip: 1 })
    expect(page.map((c) => c.subject)).toEqual(['c4', 'c3'])
  })

  it('records merge commits with two parents', async () => {
    r = await createTempRepo()
    await r.write('a.txt', '1')
    await r.commit('base')
    await r.git('switch', '-c', 'feature')
    await r.write('b.txt', '1')
    await r.commit('feature work')
    await r.git('switch', 'main')
    await r.write('c.txt', '1')
    await r.commit('main work')
    await r.git('merge', '--no-edit', 'feature')
    expect((await getLog(r.path))[0]?.parents).toHaveLength(2)
  })
})

describe('getLog order', () => {
  /** Commit with both dates set to `hour` hours after a fixed start. */
  async function commitAt(repo: TempRepo, message: string, hour: number) {
    const date = new Date(Date.UTC(2026, 0, 1, hour)).toISOString()
    await repo.write(`${message}.txt`, message)
    await repo.git('add', '-A')
    await runGit(['commit', '-qm', message], {
      cwd: repo.path,
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    })
  }

  it('keeps branches together by default, or mixes them by date', async () => {
    r = await createTempRepo()
    await commitAt(r, 'base', 0)
    await r.git('branch', 'dev')
    await commitAt(r, 'main 1', 2)
    await r.git('switch', '-q', 'dev')
    await commitAt(r, 'dev 1', 1)
    await commitAt(r, 'dev 2', 3)
    await r.git('switch', '-q', 'main')
    await commitAt(r, 'main 2', 4)

    const subjects = async (order?: 'topo' | 'date') =>
      (await getLog(r!.path, order ? { order } : {})).map((c) => c.subject)
    expect(await subjects('date')).toEqual(['main 2', 'dev 2', 'main 1', 'dev 1', 'base'])
    // Topological: each branch's commits in one run (which branch comes
    // first is git's choice), parents always after their children.
    const topo = await subjects()
    expect(topo).toEqual(await subjects('topo'))
    expect(topo.at(-1)).toBe('base')
    const runs = topo.slice(0, 4).map((s) => s.split(' ')[0])
    expect(runs.filter((name, i) => name !== runs[i - 1])).toHaveLength(2)
  })
})
