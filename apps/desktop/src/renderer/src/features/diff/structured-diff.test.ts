import { describe, expect, it } from 'vitest'
import {
  alignLists,
  jsonChanges,
  markdownBlocks,
  markdownDiff,
  previewJson,
  specialViews,
} from './structured-diff'

describe('alignLists', () => {
  it('keeps common items and marks the rest', () => {
    expect(alignLists(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { kind: 'same', value: 'a' },
      { kind: 'removed', value: 'b' },
      { kind: 'added', value: 'x' },
      { kind: 'same', value: 'c' },
    ])
  })

  it('gives up on huge inputs', () => {
    const big = Array.from({ length: 3000 }, (_, i) => String(i))
    expect(alignLists(big, big)).toBeNull()
  })
})

describe('Markdown', () => {
  it('splits into blocks, with list items separate', () => {
    expect(markdownBlocks('# Title\n\nSome text.\n\n- one\n- two\n')).toEqual([
      '# Title',
      'Some text.',
      '- one',
      '- two',
    ])
  })

  it('finds changed blocks', () => {
    const parts = markdownDiff(
      '# Title\n\nOld text.\n\n- one\n',
      '# Title\n\nNew text.\n\n- one\n- two\n',
    )
    expect(parts).toEqual([
      { kind: 'same', value: '# Title' },
      { kind: 'removed', value: 'Old text.' },
      { kind: 'added', value: 'New text.' },
      { kind: 'same', value: '- one' },
      { kind: 'added', value: '- two' },
    ])
  })
})

describe('JSON', () => {
  it('lists changes by path, ignoring key order', () => {
    const before = { name: 'app', version: '1.0.0', scripts: { old: 'x' }, list: [1, 2] }
    const after = { version: '1.1.0', name: 'app', deps: { 'a-b': '^2' }, list: [1, 3, 4] }
    expect(jsonChanges(before, after)).toEqual([
      { path: 'deps', kind: 'added', after: { 'a-b': '^2' } },
      { path: 'list[1]', kind: 'changed', before: 2, after: 3 },
      { path: 'list[2]', kind: 'added', after: 4 },
      { path: 'scripts', kind: 'removed', before: { old: 'x' } },
      { path: 'version', kind: 'changed', before: '1.0.0', after: '1.1.0' },
    ])
  })

  it('quotes awkward keys and reports a whole-document change', () => {
    expect(jsonChanges({ 'a b': 1 }, { 'a b': 2 })[0]?.path).toBe('["a b"]')
    expect(jsonChanges(1, 'x')).toEqual([{ path: '', kind: 'changed', before: 1, after: 'x' }])
    expect(jsonChanges({ a: [1] }, { a: [1] })).toEqual([])
  })

  it('previews long values', () => {
    expect(previewJson('x'.repeat(100), 10)).toBe('"xxxxxxxx…')
  })
})

describe('specialViews', () => {
  it('offers views by file type', () => {
    expect(specialViews('docs/README.md')).toEqual(['rendered'])
    expect(specialViews('package.json')).toEqual(['structure'])
    expect(specialViews('src/app.ts')).toEqual([])
  })
})
