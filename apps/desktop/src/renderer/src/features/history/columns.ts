/**
 * The optional columns of the history list, and which are shown. The graph
 * and the commit message are always there; the rest can be turned on and
 * off with the Columns menu (history-toolbar.tsx, or right-click the column
 * headers). The choice is saved in settings, so it survives restarts.
 */
import type { HistoryColumn } from '@shared/ipc'

export interface ColumnDef {
  id: HistoryColumn
  /** Header text and menu label. */
  label: string
  /** Tailwind width class; the header uses the same so they line up. */
  width: string
  /** Shown in the Columns menu to explain less obvious columns. */
  hint?: string
}

/** Every optional column, in the order they appear left to right. */
export const COLUMNS: ColumnDef[] = [
  {
    id: 'changes',
    label: 'Changes',
    width: 'w-32',
    hint: 'Files and lines changed (merges: what they brought in)',
  },
  { id: 'author', label: 'Author', width: 'w-36' },
  { id: 'date', label: 'Date', width: 'w-28', hint: 'When the change was written' },
  {
    id: 'committer',
    label: 'Committer',
    width: 'w-36',
    hint: 'Who made the commit (differs from the author after a rebase or cherry-pick)',
  },
  {
    id: 'commitDate',
    label: 'Commit date',
    width: 'w-28',
    hint: 'When the commit was made or last rewritten',
  },
  { id: 'sha', label: 'Commit', width: 'w-16', hint: 'Short hash' },
]

/** The columns to show, in display order, ignoring unknown ids from old settings. */
export function visibleColumns(selected: readonly string[]): ColumnDef[] {
  return COLUMNS.filter((c) => selected.includes(c.id))
}

/** The selection with `id` turned on or off, kept in display order. */
export function toggleColumn(selected: readonly HistoryColumn[], id: HistoryColumn) {
  const on = selected.includes(id)
  return COLUMNS.map((c) => c.id).filter((c) => (c === id ? !on : selected.includes(c)))
}
