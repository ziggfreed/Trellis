import { afterEach, describe, expect, it } from 'vitest'
import { getLog, searchCommits } from '../src'
import { createRepoWithRemote, createTempRepo, type TempRepo } from './helpers'

const cleanups: TempRepo[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((r) => r.cleanup()))
})

async function repoWithHistory() {
  const repo = await createTempRepo()
  cleanups.push(repo)
  const commit = async (message: string, author?: string) => {
    await repo.write('file.txt', message)
    await repo.git('add', '-A')
    await repo.git('commit', '-q', '-m', message, ...(author ? [`--author=${author}`] : []))
  }
  await commit('Add login page')
  await commit('Fix crash in parser (issue [42])', 'Grace Hopper <grace@example.com>')
  await commit('Update README')
  return repo
}

const subjects = async (repo: TempRepo, shas: string[]) => {
  const bySha = new Map((await getLog(repo.path)).map((c) => [c.sha, c.subject]))
  return shas.map((s) => bySha.get(s))
}

describe('searchCommits', () => {
  it('matches messages, ignoring case', async () => {
    const repo = await repoWithHistory()
    expect(await subjects(repo, await searchCommits(repo.path, 'LOGIN'))).toEqual([
      'Add login page',
    ])
  })

  it('treats the query as plain text, not a regular expression', async () => {
    const repo = await repoWithHistory()
    const found = await searchCommits(repo.path, '[42]')
    expect(await subjects(repo, found)).toEqual(['Fix crash in parser (issue [42])'])
  })

  it('matches authors by name or email', async () => {
    const repo = await repoWithHistory()
    expect(await subjects(repo, await searchCommits(repo.path, 'grace'))).toEqual([
      'Fix crash in parser (issue [42])',
    ])
  })

  it('matches a commit hash prefix', async () => {
    const repo = await repoWithHistory()
    const sha = (await repo.git('rev-parse', 'HEAD~1')).trim()
    expect(await searchCommits(repo.path, sha.slice(0, 8))).toContain(sha)
  })

  it('returns nothing for an empty query or no matches', async () => {
    const repo = await repoWithHistory()
    expect(await searchCommits(repo.path, '  ')).toEqual([])
    expect(await searchCommits(repo.path, 'no such thing')).toEqual([])
  })

  it('excludes remote-only commits with the "local" scope', async () => {
    const { repo, remote } = await createRepoWithRemote()
    cleanups.push(repo, remote)
    // Make a commit that only exists on origin/main.
    await repo.write('remote.txt', 'r')
    await repo.commit('remote only change')
    await repo.git('push', '-q', 'origin', 'main')
    await repo.git('reset', '-q', '--hard', 'HEAD~1')
    expect(await searchCommits(repo.path, 'remote only', { scope: 'all' })).toHaveLength(1)
    expect(await searchCommits(repo.path, 'remote only', { scope: 'local' })).toHaveLength(0)
  })
})
