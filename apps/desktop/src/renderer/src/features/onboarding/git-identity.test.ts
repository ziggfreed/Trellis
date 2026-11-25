import { describe, expect, it } from 'vitest'
import { emailProblem, isComplete } from './git-identity'

describe('git identity helpers', () => {
  it('catches empty and mistyped emails', () => {
    expect(emailProblem('')).toMatch(/Enter/)
    expect(emailProblem('ada.example.com')).toMatch(/doesn’t look/)
    expect(emailProblem('ada @example.com')).toMatch(/doesn’t look/)
    expect(emailProblem(' ada@example.com ')).toBeNull()
  })

  it('needs both a name and an email', () => {
    expect(isComplete({ name: 'Ada', email: 'ada@example.com' })).toBe(true)
    expect(isComplete({ name: 'Ada', email: null })).toBe(false)
    expect(isComplete(undefined)).toBe(false)
  })
})
