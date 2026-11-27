import { describe, expect, it } from 'vitest'
import { filterByWords, highlightParts, matchesWords, searchWords } from './sidebar-search'

describe('searchWords / matchesWords', () => {
  it('ignores case and needs every word, in any order', () => {
    const words = searchWords('  Log FEAT ')
    expect(words).toEqual(['log', 'feat'])
    expect(matchesWords('feature/login', words)).toBe(true)
    expect(matchesWords('feature/search', words)).toBe(false)
  })

  it('treats an empty search as no search', () => {
    expect(searchWords('   ')).toEqual([])
    expect(filterByWords(['a', 'b'], [], (s) => s)).toEqual(['a', 'b'])
  })
})

describe('filterByWords', () => {
  it('keeps the items whose text matches', () => {
    const items = [{ name: 'main' }, { name: 'fix/footer' }, { name: 'feature/footer-links' }]
    expect(filterByWords(items, searchWords('foot'), (i) => i.name).map((i) => i.name)).toEqual([
      'fix/footer',
      'feature/footer-links',
    ])
  })
})

describe('highlightParts', () => {
  it('marks every place a word appears, merging overlaps', () => {
    expect(highlightParts('feature/login', ['log', 'feat', 'gin'])).toEqual([
      { text: 'feat', match: true },
      { text: 'ure/', match: false },
      { text: 'login', match: true },
    ])
  })

  it('returns the whole label unmarked with no words', () => {
    expect(highlightParts('main', [])).toEqual([{ text: 'main', match: false }])
  })
})
