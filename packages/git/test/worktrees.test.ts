import { afterEach, describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  addWorktree,
  getHead,
  getWorktrees,
  parseWorktrees,
  pruneWorktrees,
  removeWorktree,
} from '../src'
import { createTempDir, createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
let dir: string | undefined
afterEach(async () => {
  await repo?.cleanup()
  if (dir) await rm(dir, { recursive: true, force: true })
  repo = undefined
  dir = undefined
})
const norm = (p: string) => realpathSync.native(p).replaceAll('\\', '/')

describe('parseWorktrees', () => {
  it('parses branches, detached heads and flags', () => {
    const output = [
      'worktree /repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /repo-feature',
      'HEAD bbb',
      'detached',
      'locked in use',
      '',
      'worktree /gone',
      'HEAD ccc',
      'branch refs/heads/old',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n')
    expect(parseWorktrees(output)).toEqual([
      {
        path: '/repo',
        head: 'aaa',
        branch: 'main',
        isMain: true,
        bare: false,
        locked: false,
        prunable: false,
      },
      {
        path: '/repo-feature',
        head: 'bbb',
        branch: null,
        isMain: false,
        bare: false,
        locked: true,
        prunable: false,
      },
      {
        path: '/gone',
        head: 'ccc',
        branch: 'old',
        isMain: false,
        bare: false,
        locked: false,
        prunable: true,
      },
    ])
  })
})

describe('worktrees', () => {
  it('adds, lists and removes worktrees', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a')
    await repo.commit('base')
    await repo.git('branch', 'existing')
    dir = await createTempDir()

    const newPath = join(dir, 'new-branch')
    const existingPath = join(dir, 'existing')
    await addWorktree(repo.path, newPath, { newBranch: 'feature/x' })
    await addWorktree(repo.path, existingPath, { branch: 'existing' })
    expect(await getHead(newPath)).toMatchObject({ kind: 'branch', name: 'feature/x' })

    // The main worktree is always first; git orders the others itself.
    const list = await getWorktrees(repo.path)
    expect([norm(list[0]!.path), list[0]!.branch, list[0]!.isMain]).toEqual([
      norm(repo.path),
      'main',
      true,
    ])
    const others = list.slice(1).map((w) => [norm(w.path), w.branch, w.isMain])
    expect(others).toHaveLength(2)
    expect(others).toContainEqual([norm(newPath), 'feature/x', false])
    expect(others).toContainEqual([norm(existingPath), 'existing', false])

    await removeWorktree(repo.path, newPath)
    expect(await getWorktrees(repo.path)).toHaveLength(2)
  })

  it('refuses to remove a worktree with changes unless forced, and prunes deleted ones', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'a')
    await repo.commit('base')
    dir = await createTempDir()
    const path = join(dir, 'wt')
    await addWorktree(repo.path, path, { newBranch: 'wt' })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(path, 'a.txt'), 'changed')
    await expect(removeWorktree(repo.path, path)).rejects.toThrow()
    await removeWorktree(repo.path, path, true)

    const gone = join(dir, 'gone')
    await addWorktree(repo.path, gone, { newBranch: 'gone' })
    await rm(gone, { recursive: true, force: true })
    expect((await getWorktrees(repo.path)).find((w) => w.branch === 'gone')?.prunable).toBe(true)
    await pruneWorktrees(repo.path)
    expect(await getWorktrees(repo.path)).toHaveLength(1)
  })
})
