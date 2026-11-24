import { describe, expect, it } from 'vitest'
import { countConflicts, parseConflicts, resolveConflicts } from '../src/conflicts'

const FILE = [
  'before',
  '<<<<<<< HEAD',
  'mine 1',
  'mine 2',
  '=======',
  'theirs',
  '>>>>>>> feature',
  'middle',
  '<<<<<<< HEAD',
  'a',
  '||||||| base',
  'original',
  '=======',
  'b',
  '>>>>>>> feature',
  'after',
  '',
].join('\n')

describe('parseConflicts', () => {
  it('finds conflict blocks with labels, including diff3 base sections', () => {
    const parsed = parseConflicts(FILE)!
    expect(countConflicts(parsed)).toBe(2)
    expect(parsed.segments[1]).toEqual({
      kind: 'conflict',
      currentLabel: 'HEAD',
      incomingLabel: 'feature',
      current: ['mine 1', 'mine 2'],
      base: null,
      incoming: ['theirs'],
    })
    expect(parsed.segments[3]).toMatchObject({
      base: ['original'],
      current: ['a'],
      incoming: ['b'],
    })
  })

  it('returns null for an unfinished block', () => {
    expect(parseConflicts('<<<<<<< HEAD\nmine\n=======\ntheirs\n')).toBeNull()
  })

  it('ignores lines that only look like markers', () => {
    expect(countConflicts(parseConflicts('======== heading\n<<<<<<<< too long\n')!)).toBe(0)
  })
})

describe('resolveConflicts', () => {
  const parsed = parseConflicts(FILE)!

  it('applies a choice per block', () => {
    expect(resolveConflicts(parsed, [{ kind: 'incoming' }, { kind: 'both' }])).toBe(
      'before\ntheirs\nmiddle\na\nb\nafter\n',
    )
    expect(resolveConflicts(parsed, [{ kind: 'current' }, { kind: 'both-reversed' }])).toBe(
      'before\nmine 1\nmine 2\nmiddle\nb\na\nafter\n',
    )
  })

  it('uses custom text, and allows removing a block entirely', () => {
    expect(
      resolveConflicts(parsed, [
        { kind: 'custom', text: 'merged\nby hand\n' },
        { kind: 'custom', text: '' },
      ]),
    ).toBe('before\nmerged\nby hand\nmiddle\nafter\n')
  })

  it('keeps markers for blocks without a choice', () => {
    const text = resolveConflicts(parsed, [{ kind: 'current' }])
    expect(text).toContain('<<<<<<< HEAD\na\n|||||||\noriginal\n=======\nb\n>>>>>>> feature')
    expect(countConflicts(parseConflicts(text)!)).toBe(1)
  })

  it('keeps Windows line endings and a missing final newline', () => {
    const crlf = parseConflicts('x\r\n<<<<<<< HEAD\r\na\r\n=======\r\nb\r\n>>>>>>> f')!
    expect(resolveConflicts(crlf, [{ kind: 'both' }])).toBe('x\r\na\r\nb')
  })
})
