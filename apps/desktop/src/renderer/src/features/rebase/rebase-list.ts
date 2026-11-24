/**
 * Pure helpers for the interactive rebase editor's list of commits.
 */
import type { Commit, RebaseAction, RebasePlanItem } from '@shared/ipc'

/** One row in the editor: the commit plus what the user chose for it. */
export interface RebaseRow {
  commit: Commit
  action: RebaseAction
  /** Edited message, used when the action is 'reword'. */
  message: string
}

export function initialRows(commits: Commit[]): RebaseRow[] {
  return commits.map((commit) => ({
    commit,
    action: 'pick',
    message: commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject,
  }))
}

/** Move the row at `from` to position `to`. Returns a new array. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length)
    return [...rows]
  const next = [...rows]
  const [row] = next.splice(from, 1)
  next.splice(to, 0, row!)
  return next
}

export function toPlan(rows: readonly RebaseRow[]): RebasePlanItem[] {
  return rows.map((row) => ({
    sha: row.commit.sha,
    action: row.action,
    ...(row.action === 'reword' ? { message: row.message } : {}),
  }))
}

/** True if the plan would change nothing (every commit picked, in the original order). */
export function isUnchanged(rows: readonly RebaseRow[], original: readonly Commit[]): boolean {
  return rows.every((row, i) => row.action === 'pick' && row.commit.sha === original[i]?.sha)
}

/** How many commits the result will have (squash, fixup and drop remove one each). */
export function resultCount(rows: readonly RebaseRow[]): number {
  return rows.filter((row) => row.action === 'pick' || row.action === 'reword').length
}
