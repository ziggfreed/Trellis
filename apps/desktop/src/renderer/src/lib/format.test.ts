import { describe, expect, it } from 'vitest'
import { formatBytes, formatRelativeDate, shortSha, splitPath } from './format'

describe('formatRelativeDate', () => {
  const now = Date.UTC(2026, 10, 24, 12, 0, 0)
  it('describes recent times relatively', () => {
    expect(formatRelativeDate(now - 10_000, now)).toBe('just now')
    expect(formatRelativeDate(now - 5 * 60_000, now)).toMatch(/5 minutes ago/)
    expect(formatRelativeDate(now - 3 * 3_600_000, now)).toMatch(/3 hours ago/)
    expect(formatRelativeDate(now - 2 * 86_400_000, now)).toMatch(/2 days ago/)
  })

  it('shows a date for older times', () => {
    expect(formatRelativeDate(now - 30 * 86_400_000, now)).toMatch(/2026/)
  })
})

describe('shortSha', () => {
  it('keeps 7 characters', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456')
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('%d -> %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })
})

describe('splitPath', () => {
  it('splits folders from the file name', () => {
    expect(splitPath('src/lib/utils.ts')).toEqual({ dir: 'src/lib/', name: 'utils.ts' })
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
  })
})
