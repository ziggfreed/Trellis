import { describe, expect, it } from 'vitest'
import { isReadOnlyCommand } from './command-log'

describe('isReadOnlyCommand', () => {
  it.each([
    [['status', '--porcelain=v2'], true],
    [['log', '-z'], true],
    [['stash', 'list'], true],
    [['stash', 'push'], false],
    [['remote', '-v'], true],
    [['commit', '-F', '-'], false],
    [['push', 'origin', 'main'], false],
    [['config', '--get', 'user.name'], true],
    [['config', 'user.name', 'x'], false],
  ])('%j -> %s', (args, readOnly) => {
    expect(isReadOnlyCommand(args)).toBe(readOnly)
  })
})
