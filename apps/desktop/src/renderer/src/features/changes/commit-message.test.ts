import { describe, expect, it } from 'vitest'
import { buildCommitMessage, splitCommitMessage, summaryLength } from './commit-message'

describe('commit messages', () => {
  it('joins summary and description with a blank line', () => {
    expect(buildCommitMessage(' Fix bug ', '')).toBe('Fix bug')
    expect(buildCommitMessage('Fix bug', 'Details\nmore')).toBe('Fix bug\n\nDetails\nmore')
  })

  it('splits a message back into its parts', () => {
    expect(splitCommitMessage('Fix bug\n\nDetails\nmore')).toEqual({
      summary: 'Fix bug',
      description: 'Details\nmore',
    })
    expect(splitCommitMessage('Only summary')).toEqual({ summary: 'Only summary', description: '' })
  })

  it('rates the summary length', () => {
    expect(summaryLength('x'.repeat(50))).toBe('ok')
    expect(summaryLength('x'.repeat(51))).toBe('long')
    expect(summaryLength('x'.repeat(73))).toBe('too-long')
  })
})
