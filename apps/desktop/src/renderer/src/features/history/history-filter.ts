/**
 * Pure helpers for the history filter (author, path, dates, code changes),
 * which works alongside the search box. Both go to git as one CommitFilter;
 * matching commits are highlighted and the rest are dimmed.
 */
import type { CommitFilter } from '@shared/ipc'

/** The filter fields set from the Filter popover (the search box supplies `text`). */
export type HistoryFilter = Omit<CommitFilter, 'text'>

/** Labels for each filter field, in the order they're shown. */
export const FILTER_FIELDS: { key: keyof HistoryFilter; label: string }[] = [
  { key: 'author', label: 'Author' },
  { key: 'path', label: 'File or folder' },
  { key: 'since', label: 'From' },
  { key: 'until', label: 'To' },
  { key: 'content', label: 'Code added or removed' },
]

/** Number of filter fields with a value (shown on the Filter button). */
export function activeFilterCount(filter: HistoryFilter): number {
  return FILTER_FIELDS.filter(({ key }) => filter[key]?.trim()).length
}

/**
 * Combine the search text and the filter into what's sent to git, leaving
 * out blank fields. Returns null when there's nothing to search for.
 */
export function buildCommitFilter(search: string, filter: HistoryFilter): CommitFilter | null {
  const result: CommitFilter = {}
  if (search.trim()) result.text = search.trim()
  for (const { key } of FILTER_FIELDS) {
    const value = filter[key]?.trim()
    if (value) result[key] = value
  }
  return Object.keys(result).length ? result : null
}
