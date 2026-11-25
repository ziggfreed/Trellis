import { afterEach, describe, expect, it } from 'vitest'
import {
  getBlame,
  getComparison,
  getFileDiffContents,
  getFileHistory,
  isAncestor,
  parseBlame,
  resolveCommit,
  UNCOMMITTED_SHA,
} from '../src'
import { createTempRepo, type TempRepo } from './helpers'

let repo: TempRepo | undefined
afterEach(async () => {
  await repo?.cleanup()
  repo = undefined
})

async function author(r: TempRepo, name: string, message: string) {
  await r.git('add', '-A')
  await r.git('commit', '-q', '-m', message, `--author=${name} <${name.toLowerCase()}@example.com>`)
  return (await r.git('rev-parse', 'HEAD')).trim()
}

describe('getFileHistory', () => {
  it('lists commits that changed a file, following renames', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('a.txt', 'one\n')
    await author(r, 'Ann', 'create a')
    await r.write('other.txt', 'x')
    await author(r, 'Ann', 'unrelated')
    await r.write('a.txt', 'one\ntwo\n')
    await author(r, 'Bob', 'edit a')
    await r.git('mv', 'a.txt', 'b.txt')
    await author(r, 'Bob', 'rename to b')
    await r.write('b.txt', 'one\ntwo\nthree\n')
    await author(r, 'Cy', 'edit b')

    const history = await getFileHistory(r.path, 'b.txt')
    expect(history.map((h) => [h.commit.subject, h.path, h.change])).toEqual([
      ['edit b', 'b.txt', 'modified'],
      ['rename to b', 'b.txt', 'renamed'],
      ['edit a', 'a.txt', 'modified'],
      ['create a', 'a.txt', 'added'],
    ])
    expect(history[1]?.oldPath).toBe('a.txt')
  })
})

describe('getBlame', () => {
  it('attributes each line to the commit that last changed it', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('f.txt', 'line 1\nline 2\n')
    const first = await author(r, 'Ann', 'first')
    await r.write('f.txt', 'line 1\nline 2 changed\nline 3\n')
    const second = await author(r, 'Bob', 'second')
    await r.write('f.txt', 'line 1\nline 2 changed\nline 3\nnot committed\n')

    const blame = await getBlame(r.path, 'f.txt')
    expect(blame.lines.map((l) => [l.line, l.sha, l.text])).toEqual([
      [1, first, 'line 1'],
      [2, second, 'line 2 changed'],
      [3, second, 'line 3'],
      [4, UNCOMMITTED_SHA, 'not committed'],
    ])
    expect(blame.commits[first]).toMatchObject({
      author: 'Ann',
      authorEmail: 'ann@example.com',
      summary: 'first',
    })
    expect(blame.commits[second]?.previous).toEqual({ sha: first, path: 'f.txt' })

    // Blaming an older revision shows the file as it was then.
    const older = await getBlame(r.path, 'f.txt', first)
    expect(older.lines.map((l) => l.text)).toEqual(['line 1', 'line 2'])
  })

  it('parses lines whose text looks like a header', () => {
    const sha = 'a'.repeat(40)
    const output = `${sha} 1 1 1\nauthor A\nsummary s\nfilename f\n\t${'b'.repeat(40)} 2 2\n`
    expect(parseBlame(output).lines).toEqual([
      { sha, origLine: 1, line: 1, text: `${'b'.repeat(40)} 2 2` },
    ])
  })
})

describe('getComparison', () => {
  it('lists commits and changed files since the branches split', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('base.txt', 'base\n')
    await author(r, 'Ann', 'base')
    await r.git('switch', '-q', '-c', 'feature')
    await r.write('feature.txt', 'f\n')
    await author(r, 'Ann', 'feature 1')
    await r.write('feature.txt', 'f\nf2\n')
    await author(r, 'Ann', 'feature 2')
    await r.git('switch', '-q', 'main')
    await r.write('main.txt', 'm\n')
    await author(r, 'Bob', 'main moves on')

    const comparison = await getComparison(r.path, 'main', 'feature')
    expect(comparison.commits.map((c) => c.subject)).toEqual(['feature 2', 'feature 1'])
    expect(comparison.behind).toBe(1)
    // Only the feature's changes, not main's newer commit.
    expect(comparison.files).toEqual([
      { path: 'feature.txt', change: 'added', additions: 2, deletions: 0 },
    ])

    const diff = await getFileDiffContents(r.path, {
      kind: 'range',
      from: comparison.mergeBase!,
      to: 'feature',
      path: 'feature.txt',
    })
    expect(diff).toEqual({ old: { kind: 'missing' }, new: { kind: 'text', text: 'f\nf2\n' } })
  })
})

describe('isAncestor and resolveCommit', () => {
  it('tells which commit is older, and resolves names to hashes', async () => {
    repo = await createTempRepo()
    const r = repo
    await r.write('a.txt', 'a\n')
    await author(r, 'Ann', 'first')
    const first = (await r.git('rev-parse', 'HEAD')).trim()
    await r.write('b.txt', 'b\n')
    await author(r, 'Ann', 'second')

    expect(await isAncestor(r.path, first, 'main')).toBe(true)
    expect(await isAncestor(r.path, 'main', first)).toBe(false)
    expect(await isAncestor(r.path, 'main', 'no-such-branch')).toBe(false)

    expect(await resolveCommit(r.path, 'main')).toBe((await r.git('rev-parse', 'main')).trim())
    expect(await resolveCommit(r.path, first.slice(0, 7))).toBe(first)
    expect(await resolveCommit(r.path, 'no-such-branch')).toBeNull()
  })
})
