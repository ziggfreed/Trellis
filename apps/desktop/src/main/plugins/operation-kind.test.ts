import { describe, expect, it } from 'vitest'
import { operationKind } from './operation-kind'

describe('operationKind', () => {
  it('names changing commands', () => {
    expect(operationKind(['commit', '-m', 'x'])).toBe('commit')
    expect(operationKind(['switch', 'main'])).toBe('checkout')
    expect(operationKind(['checkout', '-b', 'topic'])).toBe('checkout')
    expect(operationKind(['fetch', '--all'])).toBe('fetch')
    expect(operationKind(['push', 'origin', 'main'])).toBe('push')
    expect(operationKind(['branch', 'new'])).toBe('branch')
    expect(operationKind(['tag', 'v1'])).toBe('tag')
    expect(operationKind(['stash', 'push'])).toBe('stash')
  })

  it('ignores reads, listings and file restores', () => {
    expect(operationKind(['status'])).toBeNull()
    expect(operationKind(['log', '-1'])).toBeNull()
    expect(operationKind(['update-ref', 'refs/x', 'abc'])).toBeNull()
    expect(operationKind(['checkout', 'HEAD', '--', 'a.txt'])).toBeNull()
    expect(operationKind(['branch'])).toBeNull()
    expect(operationKind(['branch', '--show-current'])).toBeNull()
    expect(operationKind(['tag', '--list'])).toBeNull()
    expect(operationKind(['stash', 'list'])).toBeNull()
    expect(operationKind([])).toBeNull()
  })
})
