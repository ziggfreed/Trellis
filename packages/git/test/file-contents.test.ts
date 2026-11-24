import { afterEach, describe, expect, it } from 'vitest'
import { getFileDiffContents, looksBinary, MAX_DIFF_FILE_SIZE } from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let r: TempRepo | undefined
afterEach(async () => {
  await r?.cleanup()
  r = undefined
})

describe('looksBinary', () => {
  it('detects NUL bytes', () => {
    expect(looksBinary(Buffer.from('plain text'))).toBe(false)
    expect(looksBinary(Buffer.from([0x50, 0x00, 0x51]))).toBe(true)
  })
})

describe('getFileDiffContents', () => {
  it('compares a commit with its parent', async () => {
    r = await createTempRepo()
    await r.write('a.txt', 'v1\n')
    await r.commit('one')
    await r.write('a.txt', 'v2\n')
    const sha = await r.commit('two')
    expect(await getFileDiffContents(r.path, { kind: 'commit', sha, path: 'a.txt' })).toEqual({
      old: { kind: 'text', text: 'v1\n' },
      new: { kind: 'text', text: 'v2\n' },
    })
  })

  it('reports the old side as missing for the first commit', async () => {
    r = await createTempRepo()
    await r.write('a.txt', 'v1\n')
    const sha = await r.commit('one')
    const result = await getFileDiffContents(r.path, { kind: 'commit', sha, path: 'a.txt' })
    expect(result.old).toEqual({ kind: 'missing' })
  })

  it('uses the old path for renames', async () => {
    r = await createTempRepo()
    await r.write('old.txt', 'same\n')
    await r.commit('one')
    await r.git('mv', 'old.txt', 'new.txt')
    const sha = await r.commit('rename')
    const result = await getFileDiffContents(r.path, {
      kind: 'commit',
      sha,
      path: 'new.txt',
      oldPath: 'old.txt',
    })
    expect(result.old).toEqual({ kind: 'text', text: 'same\n' })
  })

  it('compares HEAD, the index and the working tree', async () => {
    r = await createTempRepo()
    await r.write('a.txt', 'committed\n')
    await r.commit('one')
    await r.write('a.txt', 'staged\n')
    await r.git('add', 'a.txt')
    await r.write('a.txt', 'working\n')

    expect(await getFileDiffContents(r.path, { kind: 'staged', path: 'a.txt' })).toEqual({
      old: { kind: 'text', text: 'committed\n' },
      new: { kind: 'text', text: 'staged\n' },
    })
    expect(await getFileDiffContents(r.path, { kind: 'unstaged', path: 'a.txt' })).toEqual({
      old: { kind: 'text', text: 'staged\n' },
      new: { kind: 'text', text: 'working\n' },
    })
  })

  it('treats untracked files as new', async () => {
    r = await createTempRepo()
    await r.write('new.txt', 'hello\n')
    expect(await getFileDiffContents(r.path, { kind: 'unstaged', path: 'new.txt' })).toEqual({
      old: { kind: 'missing' },
      new: { kind: 'text', text: 'hello\n' },
    })
  })

  it('reports binary and too-large files without returning their contents', async () => {
    r = await createTempRepo()
    await r.write('img.bin', '\0\x01\x02binary')
    await r.write('big.txt', 'x'.repeat(MAX_DIFF_FILE_SIZE + 1))
    const sha = await r.commit('files')
    const bin = await getFileDiffContents(r.path, { kind: 'commit', sha, path: 'img.bin' })
    expect(bin.new.kind).toBe('binary')
    const big = await getFileDiffContents(r.path, { kind: 'commit', sha, path: 'big.txt' })
    expect(big.new).toEqual({ kind: 'too-large', size: MAX_DIFF_FILE_SIZE + 1 })
    const bigWorking = await getFileDiffContents(r.path, { kind: 'unstaged', path: 'big.txt' })
    expect(bigWorking.new.kind).toBe('too-large')
  })
})
