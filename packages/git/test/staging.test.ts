import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  discardAllChanges,
  discardFiles,
  getStatus,
  stageFiles,
  stashPush,
  unstageFiles,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

const statusOf = async (r: TempRepo) =>
  Object.fromEntries((await getStatus(r.path)).files.map((f) => [f.path, [f.staged, f.unstaged]]))

describe('stageFiles / unstageFiles', () => {
  it('stages and unstages modified, new and deleted files', async () => {
    repo = await createTempRepo()
    await repo.write('mod.txt', '1')
    await repo.write('del.txt', '1')
    await repo.commit('base')
    await repo.write('mod.txt', '2')
    await rm(join(repo.path, 'del.txt'))
    await repo.write('new file [1].txt', 'n') // brackets would be a pattern without literal pathspecs

    await stageFiles(repo.path, ['mod.txt', 'del.txt', 'new file [1].txt'])
    expect(await statusOf(repo)).toEqual({
      'mod.txt': ['modified', null],
      'del.txt': ['deleted', null],
      'new file [1].txt': ['added', null],
    })

    await unstageFiles(repo.path, ['mod.txt', 'del.txt', 'new file [1].txt'])
    expect(await statusOf(repo)).toEqual({
      'mod.txt': [null, 'modified'],
      'del.txt': [null, 'deleted'],
      'new file [1].txt': [null, 'untracked'],
    })
  })

  it('unstages in a repository with no commits yet', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a')
    await stageFiles(repo.path, ['a.txt'])
    await unstageFiles(repo.path, ['a.txt'])
    expect(await statusOf(repo)).toEqual({ 'a.txt': [null, 'untracked'] })
  })

  it('handles many files at once', async () => {
    repo = await createTempRepo()
    const paths = Array.from({ length: 250 }, (_, i) => `f${i}.txt`)
    for (const p of paths) await repo.write(p, p)
    await stageFiles(repo.path, paths)
    expect((await getStatus(repo.path)).files.every((f) => f.staged === 'added')).toBe(true)
  })
})

describe('discardFiles', () => {
  it('restores tracked files and deletes untracked ones', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'original')
    await repo.commit('base')
    await repo.write('a.txt', 'changed')
    await repo.write('junk.txt', 'junk')

    await discardFiles(repo.path, [
      { path: 'a.txt', untracked: false },
      { path: 'junk.txt', untracked: true },
    ])
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('original')
    expect(existsSync(join(repo.path, 'junk.txt'))).toBe(false)
  })

  it('keeps staged changes when discarding unstaged ones', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'v1')
    await repo.commit('base')
    await repo.write('a.txt', 'v2')
    await repo.git('add', 'a.txt')
    await repo.write('a.txt', 'v3')
    await discardFiles(repo.path, [{ path: 'a.txt', untracked: false }])
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('v2')
  })
})

describe('discardAllChanges', () => {
  it('puts staged files back to the last commit and deletes new ones', async () => {
    repo = await createTempRepo()
    await repo.write('kept.txt', 'original\n')
    await repo.write('gone.txt', 'gone\n')
    await repo.commit('initial')
    await repo.write('kept.txt', 'staged edit\n')
    await repo.write('new.txt', 'brand new\n')
    await rm(join(repo.path, 'gone.txt'))
    await stageFiles(repo.path, ['kept.txt', 'new.txt', 'gone.txt'])
    await repo.write('kept.txt', 'staged edit, then more\n') // unstaged on top

    await discardAllChanges(repo.path, ['kept.txt', 'new.txt', 'gone.txt'])
    expect(await readFile(join(repo.path, 'kept.txt'), 'utf8')).toBe('original\n')
    expect(existsSync(join(repo.path, 'new.txt'))).toBe(false)
    expect(existsSync(join(repo.path, 'gone.txt'))).toBe(true)
    expect((await getStatus(repo.path)).files).toEqual([])
  })
})

describe('stashPush with paths', () => {
  it('stashes only the given files, leaving the rest', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a\n')
    await repo.write('b.txt', 'b\n')
    await repo.commit('initial')
    await repo.write('a.txt', 'a changed\n')
    await repo.write('b.txt', 'b changed\n')
    await repo.write('new file.txt', 'untracked\n')
    await stageFiles(repo.path, ['b.txt'])

    const stashed = await stashPush(repo.path, {
      message: 'later',
      includeUntracked: true,
      paths: ['a.txt', 'new file.txt'],
    })
    expect(stashed).toBe(true)
    const files = (await getStatus(repo.path)).files.map((f) => [f.path, f.staged, f.unstaged])
    expect(files).toEqual([['b.txt', 'modified', null]])
    expect(await repo.git('stash', 'list')).toContain('later')
    await repo.git('stash', 'pop')
    expect(await readFile(join(repo.path, 'a.txt'), 'utf8')).toBe('a changed\n')
    expect(existsSync(join(repo.path, 'new file.txt'))).toBe(true)
  })
})
