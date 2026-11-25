/** Image diffs, bisect and stacked branches. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bisectMark,
  bisectReset,
  bisectStart,
  getBisectState,
  getImageDiff,
  getStack,
  parseBisectRefs,
  parseStack,
  rebase,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

const repos: TempRepo[] = []
afterEach(async () => {
  for (const repo of repos.splice(0)) await repo.cleanup()
})

async function repo() {
  const r = await createTempRepo()
  repos.push(r)
  await r.write('README.md', '# test\n')
  await r.commit('initial commit')
  return r
}

describe('image diff', () => {
  it('reads both versions of a binary file as base64', async () => {
    const r = await repo()
    const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, n])
    await writeFile(join(r.path, 'logo.png'), png(1))
    const sha = await r.commit('add logo')
    await writeFile(join(r.path, 'logo.png'), png(2))

    const added = await getImageDiff(r.path, { kind: 'commit', sha, path: 'logo.png' })
    expect(added.old).toEqual({ kind: 'missing' })
    expect(added.new).toEqual({ kind: 'image', base64: png(1).toString('base64'), size: 8 })

    const working = await getImageDiff(r.path, { kind: 'unstaged', path: 'logo.png' })
    expect(working.new).toMatchObject({ base64: png(2).toString('base64') })
  })
})

describe('bisect', () => {
  it('parses bisect refs', () => {
    expect(
      parseBisectRefs('refs/bisect/bad\0b1\nrefs/bisect/good-g1\0g1\nrefs/bisect/skip-s1\0s1\n'),
    ).toEqual({ bad: 'b1', good: ['g1'], skipped: ['s1'] })
  })

  it('finds the first bad commit', async () => {
    const r = await repo()
    const shas: string[] = []
    for (let i = 1; i <= 8; i++) {
      // The "bug" appears in commit 6.
      await r.write('value.txt', i >= 6 ? 'broken\n' : 'ok\n')
      await r.write(`file${i}.txt`, `${i}\n`)
      shas.push(await r.commit(`commit ${i}`))
    }
    expect(await getBisectState(r.path)).toBeNull()

    await bisectStart(r.path, shas[7]!, shas[0]!)
    let state = await getBisectState(r.path)
    expect(state).toMatchObject({ bad: shas[7], good: [shas[0]], remaining: 7, culprit: null })

    // Answer git's questions until it names the culprit.
    for (let step = 0; step < 10 && !state?.culprit; step++) {
      const value = await r.git('show', 'HEAD:value.txt')
      await bisectMark(r.path, value.trim() === 'broken' ? 'bad' : 'good')
      state = await getBisectState(r.path)
    }
    expect(state?.culprit).toBe(shas[5])

    await bisectReset(r.path)
    expect(await getBisectState(r.path)).toBeNull()
  })
})

describe('stacked branches', () => {
  it('parses a stack bottom first, with commit counts', () => {
    const output = ['t2\0HEAD -> tests', 't1\0', 'u1\0ui, ui-copy', 'a2\0api', 'a1\0'].join('\n')
    expect(parseStack(output)).toEqual([
      { name: 'api', sha: 'a2', commits: 2 },
      { name: 'ui', sha: 'u1', commits: 1 },
      { name: 'ui-copy', sha: 'u1', commits: 0 },
      { name: 'tests', sha: 't2', commits: 2 },
    ])
  })

  it('finds the stack and rebases it in one go', async () => {
    const r = await repo()
    await r.git('switch', '-c', 'api')
    await r.write('api.txt', 'api\n')
    await r.commit('api')
    await r.git('switch', '-c', 'ui')
    await r.write('ui.txt', 'ui\n')
    await r.commit('ui')
    // main moves on.
    await r.git('switch', 'main')
    await r.write('main.txt', 'main\n')
    await r.commit('main moves')
    await r.git('switch', 'ui')

    expect((await getStack(r.path, 'ui', 'main')).map((b) => b.name)).toEqual(['api', 'ui'])

    expect(await rebase(r.path, 'main', { updateRefs: true })).toEqual({ status: 'done' })
    // Both branches now sit on top of the new main.
    const mainSha = (await r.git('rev-parse', 'main')).trim()
    expect((await r.git('rev-parse', 'api~1')).trim()).toBe(mainSha)
    expect((await r.git('rev-parse', 'ui~1')).trim()).toBe((await r.git('rev-parse', 'api')).trim())
  })
})
