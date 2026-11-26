import { afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getStatus, getStatusSummary, parseStatus, parseStatusSummary } from '../src'
import { createRepoWithRemote, createTempRepo, type TempRepo } from './helpers'

const cleanups: TempRepo[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((r) => r.cleanup()))
})
async function repo() {
  const r = await createTempRepo()
  cleanups.push(r)
  return r
}

describe('parseStatus', () => {
  it('parses branch headers', () => {
    const out = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '',
    ].join('\0')
    expect(parseStatus(out).branch).toEqual({
      oid: 'abc123',
      head: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    })
  })

  it('handles a detached HEAD and an unborn branch', () => {
    expect(parseStatus('# branch.oid (initial)\0# branch.head (detached)\0').branch).toMatchObject({
      oid: null,
      head: null,
    })
  })

  it('parses ordinary, renamed, conflicted and untracked entries', () => {
    const out = [
      '1 .M N... 100644 100644 100644 aaa bbb src/my file.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts',
      'old name.ts',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
      '? notes.txt',
      '',
    ].join('\0')
    expect(parseStatus(out).files).toEqual([
      { path: 'src/my file.ts', staged: null, unstaged: 'modified' },
      { path: 'new name.ts', origPath: 'old name.ts', staged: 'renamed', unstaged: null },
      { path: 'conflict.txt', staged: null, unstaged: 'conflicted' },
      { path: 'notes.txt', staged: null, unstaged: 'untracked' },
    ])
  })
})

describe('getStatus', () => {
  it('reports a fresh repo', async () => {
    const r = await repo()
    const status = await getStatus(r.path)
    expect(status.branch).toMatchObject({ head: 'main', oid: null })
    expect(status.files).toEqual([])
  })

  it('reports staged, unstaged, deleted, renamed and untracked files', async () => {
    const r = await repo()
    await r.write('keep.txt', 'one\n')
    await r.write('remove.txt', 'bye\n')
    await r.write('old.txt', 'rename me please, enough content to detect\n')
    await r.commit('initial')

    await r.write('keep.txt', 'two\n') // unstaged modification
    await r.write('staged.txt', 'new\n')
    await r.git('add', 'staged.txt') // staged addition
    await rm(join(r.path, 'remove.txt')) // unstaged deletion
    await r.git('mv', 'old.txt', 'new.txt') // staged rename
    await r.write('dir/untracked.txt', '?\n') // untracked in a subfolder

    const files = (await getStatus(r.path)).files
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]))
    expect(byPath['keep.txt']).toMatchObject({ staged: null, unstaged: 'modified' })
    expect(byPath['staged.txt']).toMatchObject({ staged: 'added', unstaged: null })
    expect(byPath['remove.txt']).toMatchObject({ staged: null, unstaged: 'deleted' })
    expect(byPath['new.txt']).toMatchObject({ staged: 'renamed', origPath: 'old.txt' })
    expect(byPath['dir/untracked.txt']).toMatchObject({ unstaged: 'untracked' })
  })

  it('reports non-ASCII file names without escaping', async () => {
    const r = await repo()
    await r.write('café ✓.txt', 'x')
    expect((await getStatus(r.path)).files[0]?.path).toBe('café ✓.txt')
  })

  it('reports merge conflicts', async () => {
    const r = await repo()
    await r.write('a.txt', 'base\n')
    await r.commit('base')
    await r.git('switch', '-c', 'other')
    await r.write('a.txt', 'other\n')
    await r.commit('other')
    await r.git('switch', 'main')
    await r.write('a.txt', 'main\n')
    await r.commit('main')
    await r.git('merge', 'other').catch(() => {}) // fails with a conflict
    expect((await getStatus(r.path)).files).toEqual([
      { path: 'a.txt', staged: null, unstaged: 'conflicted' },
    ])
  })

  it('reports ahead/behind against the upstream', async () => {
    const { repo: r, remote } = await createRepoWithRemote()
    cleanups.push(r, remote)
    await r.write('b.txt', 'b')
    await r.commit('local only')
    expect((await getStatus(r.path)).branch).toMatchObject({
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
    })
  })
})

describe('parseStatusSummary', () => {
  it('reads the branch and counts each changed file once', () => {
    const out = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
      '1 .M N... 100644 100644 100644 aaa bbb src/my file.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts',
      // The rename's original path, even one that looks like an entry, isn't counted.
      '? looks like an entry.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.txt',
      '? notes.txt',
      '',
    ].join('\0')
    expect(parseStatusSummary(out)).toEqual({
      branch: { oid: 'abc123', head: 'main', upstream: 'origin/main', ahead: 2, behind: 1 },
      changes: 4,
    })
  })
})

describe('getStatusSummary', () => {
  it('agrees with getStatus on the branch and the number of changed files', async () => {
    const { repo: r, remote } = await createRepoWithRemote()
    cleanups.push(r, remote)
    await r.write('b.txt', 'b')
    await r.commit('local only')
    await r.write('b.txt', 'changed')
    await r.write('new/one.txt', '1')
    await r.write('new/two.txt', '2')
    const full = await getStatus(r.path)
    const summary = await getStatusSummary(r.path)
    expect(summary.branch).toEqual(full.branch)
    expect(summary.changes).toBe(full.files.length)
    expect(summary.changes).toBe(3)
  })
})
