import { describe, expect, it } from 'vitest'
import { GUIDE_PAGES, wikiUrl } from './help'

/** Names of the user guide's pages (docs/wiki in the repository). */
const WIKI_PAGES = Object.keys(import.meta.glob('../../../../../../docs/wiki/*.md')).map((path) =>
  path.split('/').pop()!.replace(/\.md$/, ''),
)

describe('user guide links', () => {
  it('point at the wiki', () => {
    expect(wikiUrl()).toBe('https://github.com/ziggfreed/Trellis/wiki')
    expect(wikiUrl('Command-Palette')).toBe(
      'https://github.com/ziggfreed/Trellis/wiki/Command-Palette',
    )
  })

  it('list pages that exist in docs/wiki', () => {
    expect(WIKI_PAGES.length).toBeGreaterThan(10) // the glob found the pages
    for (const { page } of GUIDE_PAGES) expect(WIKI_PAGES, page).toContain(page)
  })
})
