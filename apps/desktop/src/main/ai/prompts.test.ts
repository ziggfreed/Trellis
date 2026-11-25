import { describe, expect, it } from 'vitest'
import {
  cleanCommitMessage,
  commitMessagePrompt,
  limitText,
  parseConflictAnswer,
  resolveConflictPrompt,
} from './prompts'

describe('limitText', () => {
  it('keeps short text and cuts long text at a line break', () => {
    expect(limitText('abc', 10)).toEqual({ text: 'abc', truncated: false })
    expect(limitText('line one\nline two\nline three', 20)).toEqual({
      text: 'line one\nline two',
      truncated: true,
    })
  })
})

describe('commitMessagePrompt', () => {
  it('includes the diff and recent subjects for style', () => {
    const prompt = commitMessagePrompt('diff --git a/x b/x', ['feat: add x', 'fix: y'])
    expect(prompt.user).toContain('- feat: add x')
    expect(prompt.user).toContain('diff --git a/x b/x')
    expect(prompt.truncated).toBe(false)
    expect(prompt.effort).toBe('low')
  })

  it('says when the diff was cut short', () => {
    const prompt = commitMessagePrompt('x\n'.repeat(200_000), [])
    expect(prompt.truncated).toBe(true)
    expect(prompt.user).toContain('left out because it was too long')
  })
})

describe('conflicts', () => {
  it('asks for the file in a resolved code block', () => {
    expect(resolveConflictPrompt('a.txt', '<<<<<<< HEAD', '').system).toContain('```resolved')
  })

  it('splits the explanation from the resolved file', () => {
    const answer = 'Both sides renamed x.\n\n```resolved\nline 1\nline 2\n```\n'
    expect(parseConflictAnswer(answer)).toEqual({
      explanation: 'Both sides renamed x.',
      resolved: 'line 1\nline 2\n',
    })
  })

  it('gives no resolution when the block is missing or still has markers', () => {
    expect(parseConflictAnswer('I am not sure.').resolved).toBeNull()
    const markers = '```resolved\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n```'
    expect(parseConflictAnswer(markers).resolved).toBeNull()
  })
})

describe('cleanCommitMessage', () => {
  it('removes fences and surrounding quotes', () => {
    expect(cleanCommitMessage('```\nAdd x\n\nBecause.\n```')).toBe('Add x\n\nBecause.')
    expect(cleanCommitMessage('"Fix the bug"')).toBe('Fix the bug')
    expect(cleanCommitMessage('  Add "quoted" word  ')).toBe('Add "quoted" word')
  })
})
