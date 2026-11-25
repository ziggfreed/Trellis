/**
 * Content-aware diffs, as pure functions (tested in structured-diff.test.ts):
 *
 * - Markdown: split both versions into top-level blocks (paragraphs,
 *   headings, list items, code blocks...) and line them up, so the rendered
 *   view can show which blocks were added, removed or kept.
 * - JSON: compare the parsed values and list what changed by path
 *   (`dependencies.react: "18" → "19"`), ignoring formatting and key order.
 */
import { Lexer } from 'marked'

// ---------------------------------------------------------------------------
// Lining up two lists (longest common subsequence)
// ---------------------------------------------------------------------------

export type DiffPart<T> = { kind: 'same' | 'added' | 'removed'; value: T }

/**
 * Above this many comparisons (old length × new length) the alignment is
 * too slow and memory-hungry, so callers fall back to the text diff.
 */
export const MAX_COMPARISONS = 4_000_000

/**
 * Line up `before` and `after`, keeping as many items as possible in order
 * ("same") and marking the rest removed or added. Returns null when the
 * lists are too long to compare (see MAX_COMPARISONS).
 */
export function alignLists<T>(
  before: readonly T[],
  after: readonly T[],
  equal: (a: T, b: T) => boolean = Object.is,
): DiffPart<T>[] | null {
  const n = before.length
  const m = after.length
  if (n * m > MAX_COMPARISONS) return null
  // lengths[i][j] = longest common subsequence of before[i..] and after[j..]
  const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i]![j] = equal(before[i]!, after[j]!)
        ? lengths[i + 1]![j + 1]! + 1
        : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const parts: DiffPart<T>[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (equal(before[i]!, after[j]!)) {
      parts.push({ kind: 'same', value: after[j]! })
      i++
      j++
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      parts.push({ kind: 'removed', value: before[i++]! })
    } else {
      parts.push({ kind: 'added', value: after[j++]! })
    }
  }
  while (i < n) parts.push({ kind: 'removed', value: before[i++]! })
  while (j < m) parts.push({ kind: 'added', value: after[j++]! })
  return parts
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/**
 * The top-level blocks of a Markdown document, as source text. Lists are
 * split into their items, so changing one item doesn't mark the whole list.
 */
export function markdownBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const token of Lexer.lex(text)) {
    if (token.type === 'space') continue
    if (token.type === 'list') {
      // Keep each item a valid one-item list, so it still renders as a list.
      for (const item of token.items) blocks.push(item.raw.trimEnd())
    } else {
      blocks.push(token.raw.trim())
    }
  }
  return blocks
}

/** Block-level diff of two Markdown documents (null if too long to compare). */
export function markdownDiff(oldText: string, newText: string): DiffPart<string>[] | null {
  return alignLists(markdownBlocks(oldText), markdownBlocks(newText))
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export interface JsonChange {
  /** Where, e.g. `dependencies.react` or `items[2].name` (empty for the whole document). */
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: unknown
  after?: unknown
}

type JsonParse = { ok: true; value: unknown } | { ok: false; error: string }

export function parseJson(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Add a key to a path, quoting keys that aren't simple names. */
function childPath(path: string, key: string): string {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return path ? `${path}.${key}` : key
  return `${path}[${JSON.stringify(key)}]`
}

/**
 * Every difference between two JSON values, deepest first where it
 * matters: objects are compared key by key (order ignored), arrays index
 * by index, anything else by value.
 */
export function jsonChanges(before: unknown, after: unknown, path = ''): JsonChange[] {
  if (isObject(before) && isObject(after)) {
    const changes: JsonChange[] = []
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const key of [...keys].sort()) {
      const p = childPath(path, key)
      if (!(key in after)) changes.push({ path: p, kind: 'removed', before: before[key] })
      else if (!(key in before)) changes.push({ path: p, kind: 'added', after: after[key] })
      else changes.push(...jsonChanges(before[key], after[key], p))
    }
    return changes
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: JsonChange[] = []
    const length = Math.max(before.length, after.length)
    for (let i = 0; i < length; i++) {
      const p = `${path}[${i}]`
      if (i >= after.length) changes.push({ path: p, kind: 'removed', before: before[i] })
      else if (i >= before.length) changes.push({ path: p, kind: 'added', after: after[i] })
      else changes.push(...jsonChanges(before[i], after[i], p))
    }
    return changes
  }
  return Object.is(before, after) || JSON.stringify(before) === JSON.stringify(after)
    ? []
    : [{ path, kind: 'changed', before, after }]
}

/** A short one-line form of a JSON value, for the change list. */
export function previewJson(value: unknown, max = 80): string {
  const text = JSON.stringify(value) ?? 'undefined'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// ---------------------------------------------------------------------------

/** The extra views a file type offers besides the line diff. */
export function specialViews(path: string): ('rendered' | 'structure' | 'image')[] {
  const lower = path.toLowerCase()
  // SVG is text (so it has a line diff) and an image.
  if (lower.endsWith('.svg')) return ['image']
  if (/\.(md|markdown|mdx)$/.test(lower)) return ['rendered']
  if (/\.json$/.test(lower) || lower.endsWith('.webmanifest')) return ['structure']
  return []
}
