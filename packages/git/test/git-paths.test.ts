/**
 * Tests for the cached git folder lookups.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { gitDir, gitPath, gitPathsOf } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let r: TempRepo | undefined
afterEach(async () => {
  await r?.cleanup()
  r = undefined
})

const real = (path: string) => realpathSync.native(path)

describe('gitDir / gitPath', () => {
  it('finds the git folder and files in it', async () => {
    r = await createTempRepo()
    expect(real(await gitDir(r.path))).toBe(real(join(r.path, '.git')))
    expect(await gitPath(r.path, 'index')).toBe(join(await gitDir(r.path), 'index'))
  })

  it('looks up several paths at once, in order', async () => {
    r = await createTempRepo()
    const dir = await gitDir(r.path)
    expect(await gitPathsOf(r.path, ['HEAD', 'index', 'refs'])).toEqual([
      join(dir, 'HEAD'),
      join(dir, 'index'),
      join(dir, 'refs'),
    ])
  })
})
