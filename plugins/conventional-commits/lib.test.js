import { describe, expect, it } from 'vitest'
import { formatMessage, isConventional, parseTypes } from './lib.js'

const types = parseTypes('feat, fix ,docs,  , bad type')

describe('conventional commits', () => {
  it('reads the list of types', () => {
    expect(types).toEqual(['feat', 'fix', 'docs'])
  })

  it.each([
    ['feat: add login', true],
    ['fix(parser): handle empty input', true],
    ['feat!: drop old API', true],
    ['feat(api)!: rename endpoints', true],
    ['FIX: shouting is fine', true],
    ["Merge branch 'feature' into main", true],
    ['chore: tidy', false], // not in the list
    ['add login', false],
    ['feat:missing space', false],
    ['feat(): empty scope', false],
  ])('%s -> %s', (subject, expected) => {
    expect(isConventional(subject, types)).toBe(expected)
  })

  it('formats messages', () => {
    expect(formatMessage({ type: 'feat', description: ' add login ' })).toBe('feat: add login')
    expect(
      formatMessage({
        type: 'fix',
        scope: 'ui',
        breaking: true,
        description: 'x',
        body: 'Details.',
      }),
    ).toBe('fix(ui)!: x\n\nDetails.')
  })
})
