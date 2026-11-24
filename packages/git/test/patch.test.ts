import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  allLineIds,
  applyPatch,
  buildPartialPatch,
  getFilePatch,
  hunkLineIds,
  lineId,
  parsePatch,
  type FilePatch,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

const SAMPLE = `diff --git a/f.txt b/f.txt
index 1111111..2222222 100644
--- a/f.txt
+++ b/f.txt
@@ -1,3 +1,3 @@ heading
 one
-two
+TWO
 three
@@ -10 +10,2 @@
 ten
+eleven
\\ No newline at end of file
`

describe('parsePatch', () => {
  it('parses hunks, line numbers and the no-newline marker', () => {
    const patch = parsePatch(SAMPLE)!
    expect(patch.header).toHaveLength(4)
    expect(patch.hunks).toHaveLength(2)
    expect(patch.hunks[0]).toMatchObject({
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 3,
      context: 'heading',
    })
    expect(patch.hunks[0]!.lines.map((l) => [l.kind, l.text, l.oldLine, l.newLine])).toEqual([
      ['context', 'one', 1, 1],
      ['delete', 'two', 2, null],
      ['add', 'TWO', null, 2],
      ['context', 'three', 3, 3],
    ])
    // "@@ -10 +10,2 @@" omits the count when it is 1.
    expect(patch.hunks[1]).toMatchObject({ oldStart: 10, oldCount: 1, newCount: 2 })
    expect(patch.hunks[1]!.lines[1]).toMatchObject({ text: 'eleven', noNewline: true })
  })

  it('detects binary, new and deleted files', () => {
    expect(parsePatch('diff --git a/x b/x\nBinary files a/x and b/x differ\n')!.binary).toBe(true)
    expect(parsePatch('diff --git a/x b/x\nnew file mode 100644\n')!.isNew).toBe(true)
    expect(parsePatch('')).toBeNull()
  })

  it('lists changed line ids', () => {
    const patch = parsePatch(SAMPLE)!
    expect(hunkLineIds(patch, 0)).toEqual(['0:1', '0:2'])
    expect(allLineIds(patch)).toEqual(['0:1', '0:2', '1:1'])
  })
})

describe('buildPartialPatch', () => {
  const patch = parsePatch(SAMPLE)!

  it('returns null when nothing is selected', () => {
    expect(buildPartialPatch(patch, new Set(), false)).toBeNull()
  })

  it('keeps only selected changes when applying forwards', () => {
    // Select only the addition "TWO": the deletion of "two" becomes context.
    const text = buildPartialPatch(patch, new Set([lineId(0, 2)]), false)!
    expect(text).toContain('@@ -1,3 +1,4 @@ heading\n one\n two\n+TWO\n three\n')
    expect(text).not.toContain('eleven')
  })

  it('keeps unselected additions as context when applying in reverse', () => {
    // Select only the deletion "two": the addition "TWO" stays, as context.
    const text = buildPartialPatch(patch, new Set([lineId(0, 1)]), true)!
    expect(text).toContain('@@ -1,4 +1,3 @@ heading\n one\n-two\n TWO\n three\n')
  })

  it('keeps the no-newline marker', () => {
    const text = buildPartialPatch(patch, new Set([lineId(1, 1)]), false)!
    expect(text).toContain('+eleven\n\\ No newline at end of file\n')
  })
})

/** Real-git tests: partial staging must produce exactly the expected file contents. */
describe('partial staging with git', () => {
  const lines = (n: number, changed: Record<number, string> = {}) =>
    Array.from({ length: n }, (_, i) => changed[i + 1] ?? `line ${i + 1}`).join('\n') + '\n'

  async function setup() {
    repo = await createTempRepo()
    await repo.write('f.txt', lines(20))
    await repo.commit('base')
    // Two separate hunks: line 2 and line 15 change.
    await repo.write('f.txt', lines(20, { 2: 'CHANGED 2', 15: 'CHANGED 15' }))
    return repo
  }
  const indexContent = async (r: TempRepo) => await r.git('show', ':f.txt')
  const workingContent = (r: TempRepo) => readFile(join(r.path, 'f.txt'), 'utf8')

  async function patchFor(r: TempRepo, area: 'staged' | 'unstaged'): Promise<FilePatch> {
    const patch = await getFilePatch(r.path, 'f.txt', area)
    expect(patch).not.toBeNull()
    return patch!
  }

  it('stages one hunk', async () => {
    const r = await setup()
    const patch = await patchFor(r, 'unstaged')
    expect(patch.hunks).toHaveLength(2)
    await applyPatch(
      r.path,
      buildPartialPatch(patch, new Set(hunkLineIds(patch, 1)), false)!,
      'stage',
    )
    expect(await indexContent(r)).toBe(lines(20, { 15: 'CHANGED 15' }))
    expect(await workingContent(r)).toBe(lines(20, { 2: 'CHANGED 2', 15: 'CHANGED 15' }))
  })

  it('stages only an added line, keeping the old line', async () => {
    const r = await setup()
    const patch = await patchFor(r, 'unstaged')
    const addLine = patch.hunks[0]!.lines.findIndex((l) => l.kind === 'add')
    await applyPatch(
      r.path,
      buildPartialPatch(patch, new Set([lineId(0, addLine)]), false)!,
      'stage',
    )
    // Both "line 2" (not removed) and "CHANGED 2" (added) are now in the index.
    const expected = lines(20).replace('line 2\n', 'line 2\nCHANGED 2\n')
    expect(await indexContent(r)).toBe(expected)
  })

  it('unstages one hunk', async () => {
    const r = await setup()
    await r.git('add', 'f.txt')
    const patch = await patchFor(r, 'staged')
    await applyPatch(
      r.path,
      buildPartialPatch(patch, new Set(hunkLineIds(patch, 0)), true)!,
      'unstage',
    )
    expect(await indexContent(r)).toBe(lines(20, { 15: 'CHANGED 15' }))
  })

  it('unstages only a removed line in the second hunk', async () => {
    const r = await setup()
    await r.git('add', 'f.txt')
    const patch = await patchFor(r, 'staged')
    const deleteLine = patch.hunks[1]!.lines.findIndex((l) => l.kind === 'delete')
    await applyPatch(
      r.path,
      buildPartialPatch(patch, new Set([lineId(1, deleteLine)]), true)!,
      'unstage',
    )
    // "line 15" is back in the index, in its original place before "CHANGED 15".
    const expected = lines(20, { 2: 'CHANGED 2' }).replace('line 15\n', 'line 15\nCHANGED 15\n')
    expect(await indexContent(r)).toBe(expected)
  })

  it('discards one hunk from the working tree', async () => {
    const r = await setup()
    const patch = await patchFor(r, 'unstaged')
    await applyPatch(
      r.path,
      buildPartialPatch(patch, new Set(hunkLineIds(patch, 0)), true)!,
      'discard',
    )
    expect(await workingContent(r)).toBe(lines(20, { 15: 'CHANGED 15' }))
  })

  it('stages part of an untracked file', async () => {
    repo = await createTempRepo()
    await repo.write('new.txt', 'a\nb\nc\n')
    const patch = (await getFilePatch(repo.path, 'new.txt', 'untracked'))!
    expect(patch.isNew).toBe(true)
    // Stage only lines "a" and "c".
    await applyPatch(
      repo.path,
      buildPartialPatch(patch, new Set([lineId(0, 0), lineId(0, 2)]), false)!,
      'stage',
    )
    expect(await repo.git('show', ':new.txt')).toBe('a\nc\n')
  })

  it('returns null for a file with no changes', async () => {
    repo = await createTempRepo()
    await repo.write('f.txt', 'x\n')
    await repo.commit('base')
    expect(await getFilePatch(repo.path, 'f.txt', 'unstaged')).toBeNull()
  })
})
