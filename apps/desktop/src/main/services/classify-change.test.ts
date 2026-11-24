import { describe, expect, it } from 'vitest'
import { classifyChange, mergeScopes } from './classify-change'

describe('classifyChange', () => {
  it.each([
    ['src/app.ts', 'status'],
    ['.gitignore', 'status'],
    ['.github/workflows/ci.yml', 'status'],
    ['.git/index', 'status'],
    ['.git/HEAD', 'all'],
    ['.git/refs/heads/main', 'all'],
    ['.git/packed-refs', 'all'],
    ['.git/refs/stash', 'all'],
    ['.git/index.lock', null],
    ['.git/refs/heads/main.lock', null],
    ['.git/objects/ab/cdef', null],
    ['.git/logs/HEAD', null],
  ] as const)('%s -> %s', (path, scope) => {
    expect(classifyChange(path)).toBe(scope)
  })
})

describe('mergeScopes', () => {
  it('keeps the larger scope', () => {
    expect(mergeScopes(null, 'status')).toBe('status')
    expect(mergeScopes('status', 'all')).toBe('all')
    expect(mergeScopes(null, null)).toBeNull()
  })
})
