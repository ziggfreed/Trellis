/**
 * Selecting changed lines in the hunk view. Pure functions on sets of line
 * ids ("<hunk>:<line>", see @trellis/git/patch).
 */

/** Add or remove one line. Returns a new set. */
export function toggleLine(selection: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selection)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Shift-click: select every changed line between `anchor` and `target`
 * (inclusive), in display order. `ordered` lists all selectable ids in order.
 */
export function selectRange(
  selection: ReadonlySet<string>,
  ordered: readonly string[],
  anchor: string,
  target: string,
): Set<string> {
  const from = ordered.indexOf(anchor)
  const to = ordered.indexOf(target)
  if (from === -1 || to === -1) return toggleLine(selection, target)
  const [start, end] = from <= to ? [from, to] : [to, from]
  const next = new Set(selection)
  for (const id of ordered.slice(start, end + 1)) next.add(id)
  return next
}
