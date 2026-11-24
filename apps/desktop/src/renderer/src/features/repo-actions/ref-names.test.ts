import { describe, expect, it } from 'vitest'
import { suggestBranchName, validateRefName } from './ref-names'

describe('validateRefName', () => {
  it.each(['main', 'feature/login', 'fix-123', 'v1.0.0', 'user/name.with.dots'])(
    'accepts %s',
    (name) => {
      expect(validateRefName(name)).toBeNull()
    },
  )

  it.each([
    '',
    'has space',
    'a..b',
    'tilde~',
    'caret^',
    'colon:',
    'star*',
    'open[',
    'back\\slash',
    '-starts-with-dash',
    '/leading',
    'trailing/',
    'double//slash',
    'ends.',
    '.hidden',
    'feature/.hidden',
    'name.lock',
    'a@{b',
    '@',
  ])('rejects %j', (name) => {
    expect(validateRefName(name)).not.toBeNull()
  })
})

describe('suggestBranchName', () => {
  it('turns text into a branch name', () => {
    expect(suggestBranchName('  Fix login bug! ')).toBe('fix-login-bug')
    expect(suggestBranchName('feature/New Thing')).toBe('feature/new-thing')
  })
})
