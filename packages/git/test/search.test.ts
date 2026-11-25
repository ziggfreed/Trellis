import { afterEach, describe, expect, it } from 'vitest'
import { findCommits, getLog, isEmptyFilter, runGit, searchCommits } from '../src'
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

describe('findCommits', () => {
  /** Three commits by two authors, on different days, touching different files. */
  async function filterRepo() {
    const repo = await createTempRepo()
    cleanups.push(repo)
    const commit = async (
      file: string,
      text: string,
      message: string,
      author: string,
      day: string,
    ) => {
      await repo.write(file, text)
      await repo.git('add', '-A')
      // Date filters use the commit date, so set it as well as the author date.
      const date = `${day}T12:00:00`
      await runGit(['commit', '-q', '-m', message, `--author=${author}`, `--date=${date}`], {
        cwd: repo.path,
        env: { GIT_COMMITTER_DATE: date },
      })
    }
    await commit(
      'src/app.ts',
      'const answer = 41\n',
      'Start app',
      'Ann <ann@example.com>',
      '2026-01-10',
    )
    await commit('docs/guide.md', '# Guide\n', 'Write guide', 'Bob <bob@example.com>', '2026-02-10')
    await commit(
      'src/app.ts',
      'const answer = 42\n',
      'Fix answer',
      'Ann <ann@example.com>',
      '2026-03-10',
    )
    return repo
  }

  it('filters by author, path and date, combining them', async () => {
    const repo = await filterRepo()
    const find = async (filter: Parameters<typeof findCommits>[1]) =>
      subjects(repo, await findCommits(repo.path, filter))

    expect(await find({ author: 'ann' })).toEqual(['Fix answer', 'Start app'])
    expect(await find({ path: 'docs' })).toEqual(['Write guide'])
    expect(await find({ path: 'src/*.ts' })).toEqual(['Fix answer', 'Start app'])
    expect(await find({ since: '2026-02-01' })).toEqual(['Fix answer', 'Write guide'])
    expect(await find({ until: '2026-02-10' })).toEqual(['Write guide', 'Start app'])
    expect(await find({ author: 'ann', since: '2026-02-01' })).toEqual(['Fix answer'])
    expect(await find({ text: 'guide', path: 'src' })).toEqual([])
  })

  it('finds commits that added or removed some text (pickaxe)', async () => {
    const repo = await filterRepo()
    const shas = await findCommits(repo.path, { content: 'answer = 41' })
    // Added in "Start app", removed in "Fix answer".
    expect(await subjects(repo, shas)).toEqual(['Fix answer', 'Start app'])
    expect(await findCommits(repo.path, { content: 'not in any file' })).toEqual([])
  })

  it('treats a filter with only blank fields as empty', async () => {
    expect(isEmptyFilter({})).toBe(true)
    expect(isEmptyFilter({ text: '  ', author: '' })).toBe(true)
    expect(isEmptyFilter({ path: 'src' })).toBe(false)
  })
})
