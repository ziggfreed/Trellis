import { describe, expect, it } from 'vitest'
import { javascript } from '@codemirror/lang-javascript'
import { highlightLines } from './highlight-lines'

describe('highlightLines', () => {
  it('splits code into classed segments, one array per line', () => {
    const parser = javascript().language.parser
    const lines = highlightLines('const x = "hi" // note\nreturn 1', parser)
    expect(lines).toHaveLength(2)
    const classOf = (line: number, text: string) =>
      lines[line]!.find((s) => s.text === text)?.className
    expect(classOf(0, 'const')).toBe('tok-keyword')
    expect(classOf(0, '"hi"')).toBe('tok-string')
    expect(classOf(0, '// note')).toBe('tok-comment')
    expect(classOf(1, '1')).toBe('tok-number')
    // No text is lost.
    expect(lines.map((l) => l.map((s) => s.text).join('')).join('\n')).toBe(
      'const x = "hi" // note\nreturn 1',
    )
  })
})
