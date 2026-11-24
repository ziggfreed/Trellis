import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  checkoutBranch,
  commit,
  createBranch,
  deleteBranch,
  discardFiles,
  getHead,
  getRefs,
  getStatus,
  getUndoState,
  merge,
  planRefChanges,
  recordOperation,
  redo,
  reset,
  stageFiles,
  undo,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

async function setup() {
  repo = await createTempRepo()
  await repo.write('a.txt', 'one\n')
  await repo.commit('first')
  return repo
}
const read = (r: TempRepo, file: string) => readFile(join(r.path, file), 'utf8')
const statusOf = async (r: TempRepo) =>
  (await getStatus(r.path)).files.map((f) => [f.path, f.staged, f.unstaged])
const headSha = async (r: TempRepo) => (await r.git('rev-parse', 'HEAD')).trim()

/** Shorthand for recording an operation. */
const op = <T>(r: TempRepo, label: string, worktree: boolean, run: () => Promise<T>) =>
  recordOperation(r.path, label, { worktree }, run)

describe('undo and redo', () => {
  it('undoes a commit, leaving its changes staged, and redoes it', async () => {
    const r = await setup()
    const first = await headSha(r)
    await r.write('a.txt', 'two\n')
    await stageFiles(r.path, ['a.txt'])
    await op(r, 'Commit', false, () => commit(r.path, 'second'))
    const second = await headSha(r)

    expect(await getUndoState(r.path)).toMatchObject({ undo: { label: 'Commit' }, redo: null })
    expect(await undo(r.path)).toBe('Commit')
    expect(await headSha(r)).toBe(first)
    expect(await statusOf(r)).toEqual([['a.txt', 'modified', null]])
    expect(await getUndoState(r.path)).toMatchObject({ undo: null, redo: { label: 'Commit' } })

    expect(await redo(r.path)).toBe('Commit')
    expect(await headSha(r)).toBe(second)
    expect(await statusOf(r)).toEqual([])
  })

  it('undoes staging', async () => {
    const r = await setup()
    await r.write('a.txt', 'changed\n')
    await op(r, 'Stage', false, () => stageFiles(r.path, ['a.txt']))
    await undo(r.path)
    expect(await statusOf(r)).toEqual([['a.txt', null, 'modified']])
  })

  it('brings back discarded changes and deleted untracked files', async () => {
    const r = await setup()
    await r.write('a.txt', 'precious edit\n')
    await r.write('notes/new.txt', 'untracked work\n')
    await op(r, 'Discard', true, () =>
      discardFiles(r.path, [
        { path: 'a.txt', untracked: false },
        { path: 'notes/new.txt', untracked: true },
      ]),
    )
    expect(await read(r, 'a.txt')).toBe('one\n')
    expect(existsSync(join(r.path, 'notes/new.txt'))).toBe(false)

    await undo(r.path)
    expect(await read(r, 'a.txt')).toBe('precious edit\n')
    expect(await read(r, 'notes/new.txt')).toBe('untracked work\n')

    // Redo discards them again, removing the folder it leaves empty.
    await redo(r.path)
    expect(await read(r, 'a.txt')).toBe('one\n')
    expect(existsSync(join(r.path, 'notes'))).toBe(false)
  })

  it('undoes a checkout, restoring files and removing ones from the other branch', async () => {
    const r = await setup()
    await createBranch(r.path, 'other', { checkout: true })
    await r.write('other.txt', 'only on other\n')
    await r.commit('other work')
    await checkoutBranch(r.path, 'main')

    await op(r, 'Check out other', true, () => checkoutBranch(r.path, 'other'))
    expect(existsSync(join(r.path, 'other.txt'))).toBe(true)
    await undo(r.path)
    expect(await getHead(r.path)).toMatchObject({ kind: 'branch', name: 'main' })
    expect(existsSync(join(r.path, 'other.txt'))).toBe(false)
    expect(await statusOf(r)).toEqual([])
  })

  it('undoes creating and deleting branches', async () => {
    const r = await setup()
    await op(r, 'Create branch', false, () => createBranch(r.path, 'temp'))
    await undo(r.path)
    expect((await getRefs(r.path)).map((x) => x.name)).toEqual(['main'])

    await createBranch(r.path, 'keep')
    const sha = await headSha(r)
    await op(r, 'Delete branch', false, () => deleteBranch(r.path, 'keep'))
    await undo(r.path)
    expect((await getRefs(r.path)).find((x) => x.name === 'keep')?.sha).toBe(sha)
  })

  it('undoes a hard reset, bringing back commits and uncommitted changes', async () => {
    const r = await setup()
    const first = await headSha(r)
    await r.write('a.txt', 'two\n')
    await r.commit('second')
    const second = await headSha(r)
    await r.write('a.txt', 'uncommitted\n')

    await op(r, 'Reset', true, () => reset(r.path, first, 'hard'))
    expect(await read(r, 'a.txt')).toBe('one\n')
    await undo(r.path)
    expect(await headSha(r)).toBe(second)
    expect(await read(r, 'a.txt')).toBe('uncommitted\n')
  })

  it('undoing a merge that stopped with conflicts aborts it', async () => {
    const r = await setup()
    await createBranch(r.path, 'other', { checkout: true })
    await r.write('a.txt', 'other\n')
    await r.commit('other')
    await checkoutBranch(r.path, 'main')
    await r.write('a.txt', 'main\n')
    await r.commit('main')
    const before = await headSha(r)

    expect(await op(r, 'Merge', true, () => merge(r.path, 'other'))).toEqual({
      status: 'conflicts',
    })
    await undo(r.path)
    expect((await getStatus(r.path)).operation).toBeNull()
    expect(await headSha(r)).toBe(before)
    expect(await statusOf(r)).toEqual([])
  })

  it('undoes the first commit in a new repository', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('a.txt', 'a\n')
    await stageFiles(r.path, ['a.txt'])
    await op(r, 'Commit', false, () => commit(r.path, 'first'))
    await undo(r.path)
    expect(await getHead(r.path)).toEqual({ kind: 'branch', name: 'main', unborn: true })
    expect(await statusOf(r)).toEqual([['a.txt', 'added', null]])
  })

  it('a new operation after undo clears the redo history', async () => {
    const r = await setup()
    await op(r, 'Create a', false, () => createBranch(r.path, 'a'))
    await undo(r.path)
    await op(r, 'Create b', false, () => createBranch(r.path, 'b'))
    expect(await getUndoState(r.path)).toMatchObject({ undo: { label: 'Create b' }, redo: null })
    expect(await redo(r.path)).toBeNull()
  })

  it('leaves branches changed outside Trellis alone', async () => {
    const r = await setup()
    await createBranch(r.path, 'side')
    await op(r, 'Create topic', false, () => createBranch(r.path, 'topic'))
    // Someone commits on "side" in a terminal.
    await r.git('switch', '-q', 'side')
    await r.write('side.txt', 's')
    await r.commit('terminal commit')
    const sideSha = await headSha(r)
    await r.git('switch', '-q', 'main')

    await undo(r.path)
    const refs = await getRefs(r.path)
    expect(refs.find((x) => x.name === 'topic')).toBeUndefined()
    expect(refs.find((x) => x.name === 'side')?.sha).toBe(sideSha)
  })

  it('refuses to undo when the same branch was changed since', async () => {
    const r = await setup()
    await r.write('a.txt', 'two\n')
    await stageFiles(r.path, ['a.txt'])
    await op(r, 'Commit', false, () => commit(r.path, 'second'))
    await r.write('a.txt', 'three\n')
    await r.commit('made in a terminal')
    await expect(undo(r.path)).rejects.toThrow('main has changed since')
  })

  it('does not record operations while a merge is in progress', async () => {
    const r = await setup()
    await createBranch(r.path, 'other', { checkout: true })
    await r.write('a.txt', 'other\n')
    await r.commit('other')
    await checkoutBranch(r.path, 'main')
    await r.write('a.txt', 'main\n')
    await r.commit('main')
    await merge(r.path, 'other')
    await r.write('a.txt', 'resolved\n')
    await op(r, 'Stage', false, () => stageFiles(r.path, ['a.txt']))
    expect((await getUndoState(r.path)).undo).toBeNull()
  })
})

describe('planRefChanges', () => {
  const head = { kind: 'branch', ref: 'refs/heads/main', unborn: false } as const
  it('only moves refs the operation changed', () => {
    const from = { head, refs: { 'refs/heads/main': 'B', 'refs/heads/x': 'X' } }
    const to = { head, refs: { 'refs/heads/main': 'A', 'refs/heads/x': 'X' } }
    const current = {
      head,
      refs: { 'refs/heads/main': 'B', 'refs/heads/x': 'X2', 'refs/heads/y': 'Y' },
    }
    expect(planRefChanges(current, from, to).refs).toEqual({
      'refs/heads/main': 'A',
      'refs/heads/x': 'X2',
      'refs/heads/y': 'Y',
    })
  })
})
