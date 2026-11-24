import { afterEach, describe, expect, it } from 'vitest'
import { getCommitDetails, parseNameStatus, parseNumstat } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let r: TempRepo | undefined
afterEach(async () => {
  await r?.cleanup()
  r = undefined
})

describe('parseNameStatus', () => {
  it('parses single-path and rename records', () => {
    const out = ['M', 'a.ts', 'R087', 'old.ts', 'new.ts', 'A', 'b.ts', ''].join('\0')
    expect(parseNameStatus(out)).toEqual([
      { path: 'a.ts', change: 'modified' },
      { path: 'new.ts', oldPath: 'old.ts', change: 'renamed' },
      { path: 'b.ts', change: 'added' },
    ])
  })
})

describe('parseNumstat', () => {
  it('parses counts, renames and binary files', () => {
    const out = ['3\t1\ta.ts', '0\t0\t', 'old.ts', 'new.ts', '-\t-\timg.png', ''].join('\0')
    const stats = parseNumstat(out)
    expect(stats.get('a.ts')).toEqual({ additions: 3, deletions: 1 })
    expect(stats.get('new.ts')).toEqual({ additions: 0, deletions: 0 })
    expect(stats.get('img.png')).toEqual({ additions: null, deletions: null })
  })
})

describe('getCommitDetails', () => {
  it('lists files of the first commit', async () => {
    r = await createTempRepo()
    await r.write('a.txt', 'one\ntwo\n')
    const sha = await r.commit('first')
    const details = await getCommitDetails(r.path, sha)
    expect(details.commit.subject).toBe('first')
    expect(details.files).toEqual([{ path: 'a.txt', change: 'added', additions: 2, deletions: 0 }])
  })

  it('lists modified, deleted and renamed files with line counts', async () => {
    r = await createTempRepo()
    await r.write('keep.txt', 'a\nb\n')
    await r.write('gone.txt', 'x\n')
    await r.write('old.txt', 'some content that is long enough to be detected as a rename\n')
    await r.commit('base')
    await r.write('keep.txt', 'a\nB\nc\n')
    await r.git('rm', '-q', 'gone.txt')
    await r.git('mv', 'old.txt', 'new.txt')
    const sha = await r.commit('changes')

    const files = (await getCommitDetails(r.path, sha)).files
    expect(files).toContainEqual({
      path: 'keep.txt',
      change: 'modified',
      additions: 2,
      deletions: 1,
    })
    expect(files).toContainEqual({
      path: 'gone.txt',
      change: 'deleted',
      additions: 0,
      deletions: 1,
    })
    expect(files).toContainEqual({
      path: 'new.txt',
      oldPath: 'old.txt',
      change: 'renamed',
      additions: 0,
      deletions: 0,
    })
  })

  it('shows what a merge brought in compared with the first parent', async () => {
    r = await createTempRepo()
    await r.write('a.txt', '1')
    await r.commit('base')
    await r.git('switch', '-c', 'feature')
    await r.write('feature.txt', 'f\n')
    await r.commit('feature')
    await r.git('switch', 'main')
    await r.write('main.txt', 'm\n')
    await r.commit('main')
    await r.git('merge', '--no-edit', 'feature')
    const sha = (await r.git('rev-parse', 'HEAD')).trim()
    const files = (await getCommitDetails(r.path, sha)).files
    expect(files.map((f) => f.path)).toEqual(['feature.txt'])
  })

  it('throws for an unknown commit', async () => {
    r = await createTempRepo()
    await r.write('a.txt', '1')
    await r.commit('base')
    await expect(getCommitDetails(r.path, 'deadbeef')).rejects.toThrow()
  })
})
