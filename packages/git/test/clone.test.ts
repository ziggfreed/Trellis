import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  cloneRepository,
  getHead,
  getLog,
  initRepository,
  parseCloneProgress,
  repoNameFromUrl,
} from '../src'
import { createRepoWithRemote, createTempDir, type TempRepo } from './helpers'

const cleanups: (TempRepo | string)[] = []
afterEach(async () => {
  for (const item of cleanups.splice(0)) {
    if (typeof item === 'string') await rm(item, { recursive: true, force: true })
    else await item.cleanup()
  }
})

describe('parseCloneProgress', () => {
  it('returns the latest progress line in a chunk', () => {
    const chunk = 'Receiving objects:  45% (45/100)\rReceiving objects:  46% (46/100)\r'
    expect(parseCloneProgress(chunk)).toEqual({ phase: 'Receiving objects', percent: 46 })
  })

  it('understands server-side progress', () => {
    expect(parseCloneProgress('remote: Counting objects: 10% (1/10)\r')).toEqual({
      phase: 'Counting objects',
      percent: 10,
    })
  })

  it('ignores other output', () => {
    expect(parseCloneProgress("Cloning into 'repo'...\n")).toBeNull()
  })
})

describe('repoNameFromUrl', () => {
  it.each([
    ['https://github.com/user/my-repo.git', 'my-repo'],
    ['https://github.com/user/my-repo', 'my-repo'],
    ['https://github.com/user/my-repo/', 'my-repo'],
    ['git@github.com:user/my-repo.git', 'my-repo'],
    ['C:\\code\\local-repo', 'local-repo'],
  ])('%s -> %s', (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name)
  })
})

describe('cloneRepository', () => {
  it('clones a repository', async () => {
    const { repo, remote } = await createRepoWithRemote()
    const parent = await createTempDir()
    cleanups.push(repo, remote, parent)
    const target = join(parent, 'clone')
    await cloneRepository(remote.path, target)
    expect((await getLog(target)).map((c) => c.subject)).toEqual(['initial commit'])
  })

  it('fails for a bad URL', async () => {
    const parent = await createTempDir()
    cleanups.push(parent)
    await expect(cloneRepository(join(parent, 'nope'), join(parent, 'x'))).rejects.toThrow()
  })
})

describe('initRepository', () => {
  it('creates the folder and an empty repository', async () => {
    const parent = await createTempDir()
    cleanups.push(parent)
    const dir = join(parent, 'new', 'repo')
    await initRepository(dir)
    expect(existsSync(join(dir, '.git'))).toBe(true)
    expect((await getHead(dir)).kind).toBe('branch')
  })
})
