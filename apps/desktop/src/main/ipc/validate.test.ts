import { describe, expect, it } from 'vitest'
import {
  assertFileInRepo,
  assertDiffTarget,
  assertPage,
  assertScope,
  assertSha,
  assertStringArray,
} from './validate'

describe('IPC argument validation', () => {
  it('accepts valid diff targets', () => {
    expect(() => assertDiffTarget({ kind: 'commit', sha: 'abc1234', path: 'a.ts' })).not.toThrow()
    expect(() => assertDiffTarget({ kind: 'staged', path: 'a.ts', oldPath: 'b.ts' })).not.toThrow()
    expect(() => assertDiffTarget({ kind: 'unstaged', path: 'a.ts' })).not.toThrow()
  })

  it('rejects invalid diff targets', () => {
    expect(() => assertDiffTarget(null)).toThrow()
    expect(() => assertDiffTarget({ kind: 'other', path: 'a' })).toThrow()
    expect(() => assertDiffTarget({ kind: 'staged', path: '' })).toThrow()
    // A "sha" that is really a git option must never get through.
    expect(() => assertDiffTarget({ kind: 'commit', sha: '--output=x', path: 'a' })).toThrow()
  })

  it('checks commit hashes', () => {
    expect(() => assertSha('0123456789abcdef0123456789abcdef01234567', 'sha')).not.toThrow()
    expect(() => assertSha('HEAD', 'sha')).toThrow()
  })

  it('checks pages', () => {
    expect(() => assertPage({ skip: 0, limit: 500 })).not.toThrow()
    expect(() => assertScope('local')).not.toThrow()
    expect(() => assertScope('everything')).toThrow()
    expect(() => assertPage({ skip: -1, limit: 500 })).toThrow()
    expect(() => assertPage({ skip: 0, limit: 1e9 })).toThrow()
    expect(() => assertPage({ skip: 0.5, limit: 5 })).toThrow()
  })

  it('checks string arrays', () => {
    expect(() => assertStringArray(['a', 'b'], 'x')).not.toThrow()
    expect(() => assertStringArray(['a', 1], 'x')).toThrow()
  })

  it('keeps file paths inside the repository', () => {
    expect(() => assertFileInRepo('/repo', 'src/a.ts')).not.toThrow()
    expect(() => assertFileInRepo('/repo', '../outside.txt')).toThrow()
    expect(() => assertFileInRepo('/repo', '/etc/passwd')).toThrow()
    expect(() => assertFileInRepo('/repo', '.')).toThrow()
  })
})
