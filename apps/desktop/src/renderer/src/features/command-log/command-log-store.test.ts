import { describe, expect, it } from 'vitest'
import { formatCommand } from './command-log-store'

describe('formatCommand', () => {
  it('quotes arguments that need it', () => {
    expect(formatCommand(['commit', '-F', '-'])).toBe('git commit -F -')
    expect(formatCommand(['log', '--format=%H%x1f'])).toBe("git log '--format=%H%x1f'")
    expect(formatCommand(['add', 'my file.txt'])).toBe("git add 'my file.txt'")
    expect(formatCommand(['tag', '-m', "it's"])).toBe("git tag -m 'it'\\''s'")
  })
})
