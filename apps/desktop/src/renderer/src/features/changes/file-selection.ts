/**
 * Selecting several files in the Changes view (pure, so it's easy to test).
 *
 * - Click: select just that file.
 * - Ctrl/Cmd+click: add or remove a file.
 * - Shift+click: select everything between the last clicked file and this one.
 *
 * A selection belongs to one list (Staged or Unstaged); clicking in the other
 * list starts a new one. The selected files are what the list's buttons,
 * right-click menu and drag and drop act on.
 */

export type ListArea = 'staged' | 'unstaged'

export interface FileSelection {
  area: ListArea | null
  paths: ReadonlySet<string>
  /** The last file clicked without Shift: one end of a Shift+click range. */
  anchor: string | null
}

export const NO_SELECTION: FileSelection = { area: null, paths: new Set(), anchor: null }

/**
 * The selection after clicking `path` in `area`, whose files are `ordered`
 * (top to bottom).
 */
export function clickSelection(
  current: FileSelection,
  area: ListArea,
  path: string,
  ordered: string[],
  modifiers: { toggle: boolean; range: boolean },
): FileSelection {
  const sameList = current.area === area
  if (modifiers.range && sameList && current.anchor && ordered.includes(current.anchor)) {
    const from = ordered.indexOf(current.anchor)
    const to = ordered.indexOf(path)
    const [start, end] = from < to ? [from, to] : [to, from]
    return { area, paths: new Set(ordered.slice(start, end + 1)), anchor: current.anchor }
  }
  if (modifiers.toggle && sameList) {
    const paths = new Set(current.paths)
    if (paths.has(path)) paths.delete(path)
    else paths.add(path)
    return { area, paths, anchor: path }
  }
  return { area, paths: new Set([path]), anchor: path }
}

/** The selected files of `area` that are still in the list, in list order. */
export function selectedIn(selection: FileSelection, area: ListArea, ordered: string[]): string[] {
  if (selection.area !== area) return []
  return ordered.filter((path) => selection.paths.has(path))
}

/**
 * The files to act on when a row's button is used or the row is dragged: the
 * whole selection if the row is part of it, otherwise just that row.
 */
export function filesForRow(
  selection: FileSelection,
  area: ListArea,
  path: string,
  ordered: string[],
): string[] {
  const selected = selectedIn(selection, area, ordered)
  return selected.includes(path) ? selected : [path]
}
