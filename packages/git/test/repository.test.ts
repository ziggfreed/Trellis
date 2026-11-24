import { afterEach, describe, expect, it } from 'vitest'
import { realpathSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getHead, getRepoRoot } from '../src'
import { createTempDir, createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

/**
 * git prints forward slashes, resolves symlinks (macOS /var -> /private/var)
 * and expands Windows short names (RUNNER~1), so normalise our path the same way.
 */
const normalise = async (p: string) => realpathSync.native(p).replaceAll('\\', '/')

describe('getRepoRoot', () => {
  it('returns the root when given the root', async () => {
    repo = await createTempRepo()
    expect(await getRepoRoot(repo.path)).toBe(await normalise(repo.path))
  })

  it('returns the root when given a subfolder', async () => {
    repo = await createTempRepo()
    const sub = join(repo.path, 'a', 'b')
    await mkdir(sub, { recursive: true })
    expect(await getRepoRoot(sub)).toBe(await normalise(repo.path))
  })

  it('returns null outside a repository', async () => {
    const dir = await createTempDir()
    try {
      expect(await getRepoRoot(dir)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns null for a folder that does not exist', async () => {
    expect(await getRepoRoot(join(await createTempDir(), 'missing'))).toBeNull()
  })
})

describe('getHead', () => {
  it('reports an unborn branch in a fresh repo', async () => {
    repo = await createTempRepo()
    expect(await getHead(repo.path)).toEqual({ kind: 'branch', name: 'main', unborn: true })
  })

  it('reports the current branch after a commit', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'hello')
    await repo.commit('first')
    await repo.git('switch', '-c', 'feature/x')
    expect(await getHead(repo.path)).toEqual({ kind: 'branch', name: 'feature/x', unborn: false })
  })

  it('reports a detached HEAD', async () => {
    repo = await createTempRepo()
    await repo.write('a.txt', 'hello')
    const sha = await repo.commit('first')
    await repo.git('checkout', '--detach')
    expect(await getHead(repo.path)).toEqual({ kind: 'detached', sha })
  })
})
