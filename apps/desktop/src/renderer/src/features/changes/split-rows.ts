/**
 * Lays out a hunk's lines in two columns for the side-by-side hunk view:
 * the old version on the left, the new one on the right.
 *
 * Context lines appear on both sides. A run of deleted lines followed by
 * added lines is a change, so they're paired up row by row (the first
 * deleted line next to the first added one, and so on); if one side has
 * more lines, the other side is left blank for the extra rows.
 */
import type { PatchLine } from '@shared/ipc'

/** One row: the index (into hunk.lines) of the line on each side, if any. */
export interface SplitRow {
  left: number | null
  right: number | null
}

export function splitRows(lines: Pick<PatchLine, 'kind'>[]): SplitRow[] {
  const rows: SplitRow[] = []
  let deletes: number[] = []
  let adds: number[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(deletes.length, adds.length); i++) {
      rows.push({ left: deletes[i] ?? null, right: adds[i] ?? null })
    }
    deletes = []
    adds = []
  }
  lines.forEach((line, index) => {
    if (line.kind === 'context') {
      flush()
      rows.push({ left: index, right: index })
    } else if (line.kind === 'delete') {
      // A delete after adds starts a new change.
      if (adds.length) flush()
      deletes.push(index)
    } else {
      adds.push(index)
    }
  })
  flush()
  return rows
}
