/**
 * Small formatting helpers for dates, hashes and sizes shown in the UI.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/**
 * "just now", "5 minutes ago", "yesterday", "3 days ago"... up to a week,
 * then the plain date (e.g. "12 Mar 2026"), which is easier to read for old commits.
 */
export function formatRelativeDate(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour')
  if (diff < 7 * DAY) return relative.format(-Math.floor(diff / DAY), 'day')
  return shortDate.format(timestamp)
}

/** Full date and time, e.g. "12 Mar 2026, 14:05". */
export function formatDateTime(timestamp: number): string {
  return absolute.format(timestamp)
}

/** The short form of a commit hash that git shows, e.g. "1a2b3c4". */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** Human-readable file size, e.g. "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

/** Split "src/lib/utils.ts" into { dir: "src/lib/", name: "utils.ts" }. */
export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/')
  return { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}
