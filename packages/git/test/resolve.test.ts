import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getStatus, merge, readWorkingFile, resolveFileWith, saveResolvedFile } from '../src'
import { parseConflicts, resolveConflicts } from '../src/conflicts'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

/** main and other both change a.txt (and other deletes gone.txt that main edits). */
async function conflicted() {
  repo = await createTempRepo()
  const r = repo
  await r.write('a.txt', 'start\nshared\nend\n')
  await r.write('gone.txt', 'v1\n')
  await r.commit('base')
  await r.git('switch', '-q', '-c', 'other')
  await r.write('a.txt', 'start\nfrom other\nend\n')
  await rm(join(r.path, 'gone.txt'))
  await r.commit('other')
  await r.git('switch', '-q', 'main')
  await r.write('a.txt', 'start\nfrom main\nend\n')
  await r.write('gone.txt', 'v2\n')
  await r.commit('main')
  expect(await merge(r.path, 'other')).toEqual({ status: 'conflicts' })
  return r
}
const conflictedFiles = async (r: TempRepo) =>
  (await getStatus(r.path)).files.filter((f) => f.unstaged === 'conflicted').map((f) => f.path)

describe('resolving conflicts', () => {
  it('reads the markers, saves a resolution and marks the file resolved', async () => {
    const r = await conflicted()
    const file = await readWorkingFile(r.path, 'a.txt')
    expect(file.kind).toBe('text')
    const parsed = parseConflicts(file.kind === 'text' ? file.text : '')!
    const resolved = resolveConflicts(parsed, [{ kind: 'both' }])
    expect(resolved).toBe('start\nfrom main\nfrom other\nend\n')

    await saveResolvedFile(r.path, 'a.txt', resolved)
    expect(await conflictedFiles(r)).toEqual(['gone.txt'])
    expect(await r.git('show', ':a.txt')).toBe(resolved)
  })

  it('keeps one side of a whole file', async () => {
    const r = await conflicted()
    await resolveFileWith(r.path, 'a.txt', 'incoming')
    expect(await readFile(join(r.path, 'a.txt'), 'utf8')).toBe('start\nfrom other\nend\n')
    expect(await conflictedFiles(r)).toEqual(['gone.txt'])
  })

  it('keeps our edited version of a file the other side deleted', async () => {
    const r = await conflicted()
    await resolveFileWith(r.path, 'gone.txt', 'current')
    expect(await readFile(join(r.path, 'gone.txt'), 'utf8')).toBe('v2\n')
    expect(await conflictedFiles(r)).toEqual(['a.txt'])
  })

  it('deletes the file when taking the side that deleted it', async () => {
    const r = await conflicted()
    await resolveFileWith(r.path, 'gone.txt', 'incoming')
    expect(existsSync(join(r.path, 'gone.txt'))).toBe(false)
    expect(await conflictedFiles(r)).toEqual(['a.txt'])
  })
})
