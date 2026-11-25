import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getGitIdentity, setGlobalGitIdentity } from '../src'
import { createTempDir, createTempRepo, type TempRepo } from './helpers'

describe('git identity', () => {
  let repo: TempRepo | undefined
  afterEach(async () => {
    await repo?.cleanup()
    repo = undefined
  })

  /** A throwaway global config file, so the real one isn't touched. */
  async function isolatedEnv() {
    return { GIT_CONFIG_GLOBAL: join(await createTempDir(), 'gitconfig') }
  }

  it('reports a missing global identity, then saves one', async () => {
    const env = await isolatedEnv()
    expect(await getGitIdentity(null, { env })).toEqual({ name: null, email: null })
    await setGlobalGitIdentity('Ada Lovelace', 'ada@example.com', { env })
    expect(await getGitIdentity(null, { env })).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    })
  })

  it('reads the identity a repository would use', async () => {
    repo = await createTempRepo()
    const env = await isolatedEnv()
    // createTempRepo sets a local identity, which wins over the global one.
    expect(await getGitIdentity(repo.path, { env })).toEqual({
      name: 'Trellis Test',
      email: 'test@example.com',
    })
  })
})
