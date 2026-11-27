/**
 * The search box at the top of the repository sidebar: which branches,
 * tags, stashes and worktrees match what's typed.
 *
 * Matching ignores case, and every word typed must appear somewhere in the
 * name (in any order), so "log feat" finds "feature/login". Pure, so it's
 * unit-tested (sidebar-search.test.ts).
 */

/** The words of a search, lower-cased; empty when there's nothing to search for. */
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** True if `text` contains every one of `words` (see searchWords). */
export function matchesWords(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return words.every((word) => lower.includes(word))
}

/** Items whose text (from `textOf`) matches all `words`; everything if there are none. */
export function filterByWords<T>(
  items: readonly T[],
  words: readonly string[],
  textOf: (item: T) => string,
): T[] {
  return words.length === 0 ? [...items] : items.filter((item) => matchesWords(textOf(item), words))
}

/** A piece of a label: matched pieces are drawn highlighted. */
export interface LabelPart {
  text: string
  match: boolean
}

/**
 * Split `label` into matched and unmatched parts, for highlighting every
 * place a search word appears (overlapping matches are merged).
 */
export function highlightParts(label: string, words: readonly string[]): LabelPart[] {
  const lower = label.toLowerCase()
  const marked = new Array<boolean>(label.length).fill(false)
  for (const word of words) {
    for (let i = lower.indexOf(word); i !== -1; i = lower.indexOf(word, i + 1)) {
      marked.fill(true, i, i + word.length)
    }
  }
  const parts: LabelPart[] = []
  for (let i = 0; i < label.length; i++) {
    const last = parts.at(-1)
    if (last && last.match === marked[i]) last.text += label[i]
    else parts.push({ text: label[i]!, match: marked[i]! })
  }
  return parts
}
