import { describe, expect, it } from 'vitest'
import { SHORTCUT_ACTIONS } from '@/features/shortcuts/shortcut-actions'
import { TIPS, tipIndexForDate, wrapIndex } from './tips'

/** The user guide's pages (docs/wiki in the repository): page name -> Markdown. */
const WIKI = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../../../../../../docs/wiki/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]) => [path.split('/').pop()!.replace(/\.md$/, ''), text]),
)

/** Section links (#...) a wiki page has, worked out from its headings as GitHub does. */
function anchors(page: string): Set<string> {
  const text = WIKI[page] ?? ''
  return new Set(
    [...text.matchAll(/^#+ (.+)$/gm)].map((m) =>
      m[1]!
        .toLowerCase()
        .replace(/[^\w\- ]/g, '')
        .replace(/ /g, '-'),
    ),
  )
}

describe('tips', () => {
  it('have unique ids and say something', () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length)
    for (const tip of TIPS) {
      expect(tip.title.length).toBeGreaterThan(0)
      expect(tip.body.length).toBeGreaterThan(0)
    }
  })

  it('link to pages and sections that exist in the user guide', () => {
    const pages = new Set(Object.keys(WIKI))
    expect(pages.size).toBeGreaterThan(10) // the glob found the pages
    for (const tip of TIPS.filter((t) => t.page)) {
      const [page, section] = tip.page!.split('#')
      expect(pages, `${tip.id} links to ${page}`).toContain(page)
      if (section) expect(anchors(page!), `${tip.id} links to #${section}`).toContain(section)
    }
  })

  it('name real shortcut actions', () => {
    const ids = new Set(SHORTCUT_ACTIONS.map((a) => a.id))
    for (const tip of TIPS.filter((t) => t.shortcut)) expect(ids).toContain(tip.shortcut)
  })
})

describe('wrapIndex', () => {
  it('moves forwards and backwards, wrapping at both ends', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1)
    expect(wrapIndex(2, 1, 3)).toBe(0)
    expect(wrapIndex(0, -1, 3)).toBe(2)
    expect(wrapIndex(1, -4, 3)).toBe(0)
  })

  it('copes with an empty list', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0)
  })
})

describe('tipIndexForDate', () => {
  it('shows the next tip each day, wrapping round', () => {
    const today = tipIndexForDate(new Date(2026, 10, 26), 5)
    expect(tipIndexForDate(new Date(2026, 10, 27), 5)).toBe((today + 1) % 5)
    expect(tipIndexForDate(new Date(2026, 11, 1), 5)).toBe(today)
  })

  it('is the same all day', () => {
    expect(tipIndexForDate(new Date(2026, 10, 26, 0, 1), 7)).toBe(
      tipIndexForDate(new Date(2026, 10, 26, 23, 59), 7),
    )
  })

  it('copes with an empty list', () => {
    expect(tipIndexForDate(new Date(), 0)).toBe(0)
  })
})
