import { afterEach, describe, expect, it } from 'vitest'
import { getRefs, getRemotes, getStashes, parseRemotes, parseTrack } from '../src'
import { createRepoWithRemote, createTempRepo, type TempRepo } from './helpers'

const cleanups: TempRepo[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((r) => r.cleanup()))
})

describe('parseTrack', () => {
  it.each([
    ['', { ahead: 0, behind: 0, gone: false }],
    ['ahead 2', { ahead: 2, behind: 0, gone: false }],
    ['behind 3', { ahead: 0, behind: 3, gone: false }],
    ['ahead 1, behind 4', { ahead: 1, behind: 4, gone: false }],
    ['gone', { ahead: 0, behind: 0, gone: true }],
  ])('parses "%s"', (input, expected) => {
    expect(parseTrack(input)).toEqual(expected)
  })
})

describe('parseRemotes', () => {
  it('merges fetch and push lines', () => {
    const out = 'origin\thttps://a (fetch)\norigin\thttps://b (push)\n'
    expect(parseRemotes(out)).toEqual([
      { name: 'origin', fetchUrl: 'https://a', pushUrl: 'https://b' },
    ])
  })
})

describe('getRefs', () => {
  it('lists branches, remote branches and tags', async () => {
    const { repo, remote } = await createRepoWithRemote()
    cleanups.push(repo, remote)
    const headSha = (await repo.git('rev-parse', 'HEAD')).trim()
    await repo.git('branch', 'feature/x')
    await repo.git('tag', 'v1.0') // lightweight
    await repo.git('tag', '-a', 'v1.1', '-m', 'annotated') // annotated: must resolve to the commit
    await repo.write('more.txt', 'x')
    await repo.commit('ahead of origin')

    const refs = await getRefs(repo.path)
    const byName = Object.fromEntries(refs.map((r) => [`${r.type}:${r.name}`, r]))

    expect(byName['branch:main']).toMatchObject({
      isHead: true,
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
    })
    expect(byName['branch:feature/x']).toMatchObject({ isHead: false, upstream: null })
    expect(byName['remote-branch:origin/main']).toMatchObject({ remote: 'origin', sha: headSha })
    expect(byName['tag:v1.0']?.sha).toBe(headSha)
    expect(byName['tag:v1.1']?.sha).toBe(headSha)
    expect(refs.some((r) => r.name.endsWith('/HEAD'))).toBe(false)
  })

  it('returns nothing for a fresh repo', async () => {
    const repo = await createTempRepo()
    cleanups.push(repo)
    expect(await getRefs(repo.path)).toEqual([])
  })
})

describe('getRemotes', () => {
  it('lists remotes', async () => {
    const { repo, remote } = await createRepoWithRemote()
    cleanups.push(repo, remote)
    expect(await getRemotes(repo.path)).toEqual([
      { name: 'origin', fetchUrl: remote.path, pushUrl: remote.path },
    ])
  })
})

describe('getStashes', () => {
  it('lists stashes newest first', async () => {
    const repo = await createTempRepo()
    cleanups.push(repo)
    await repo.write('a.txt', '1')
    await repo.commit('base')
    await repo.write('a.txt', '2')
    await repo.git('stash', 'push', '-m', 'first stash')
    await repo.write('a.txt', '3')
    await repo.git('stash', 'push', '-m', 'second stash')

    const stashes = await getStashes(repo.path)
    expect(stashes.map((s) => [s.index, s.name])).toEqual([
      [0, 'stash@{0}'],
      [1, 'stash@{1}'],
    ])
    expect(stashes[0]?.message).toContain('second stash')
    expect(stashes[0]?.sha).toMatch(/^[0-9a-f]{40}$/)
  })

  it('returns nothing when there are no stashes', async () => {
    const repo = await createTempRepo()
    cleanups.push(repo)
    expect(await getStashes(repo.path)).toEqual([])
  })
})
