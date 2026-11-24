import { describe, expect, it } from 'vitest'
import { checkGitInstallation, isAtLeast, parseGitVersion } from '../src'

describe('parseGitVersion', () => {
  it.each([
    ['git version 2.43.0', [2, 43, 0]],
    ['git version 2.43.0.windows.1', [2, 43, 0]],
    ['git version 2.39.3 (Apple Git-146)', [2, 39, 3]],
    ['git version 2.40', [2, 40, 0]],
  ])('parses %s', (input, [major, minor, patch]) => {
    expect(parseGitVersion(input)).toMatchObject({ major, minor, patch })
  })

  it('returns null for unrelated text', () => {
    expect(parseGitVersion('command not found')).toBeNull()
  })
})

describe('isAtLeast', () => {
  const v = (major: number, minor: number, patch: number) => ({ major, minor, patch })
  it('compares major, then minor, then patch', () => {
    expect(isAtLeast(v(2, 34, 0), v(2, 34, 0))).toBe(true)
    expect(isAtLeast(v(2, 35, 0), v(2, 34, 9))).toBe(true)
    expect(isAtLeast(v(3, 0, 0), v(2, 99, 0))).toBe(true)
    expect(isAtLeast(v(2, 33, 9), v(2, 34, 0))).toBe(false)
    expect(isAtLeast(v(2, 34, 0), v(2, 34, 1))).toBe(false)
  })
})

describe('checkGitInstallation', () => {
  it('finds the git installed on this machine', async () => {
    const result = await checkGitInstallation()
    expect(result.status).toBe('ok')
  })
})
