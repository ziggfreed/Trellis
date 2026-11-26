/**
 * Splits the working-tree status into the groups shown in the Changes view.
 *
 * A file can appear in two groups at once: if you stage part of a file and
 * keep editing it, it has both staged and unstaged changes.
 *
 * Each group is ordered by folder, then by file name (comparePaths), so all
 * the changes in one folder are listed together. In the unstaged group,
 * new (untracked) files come after changes to tracked files, sorted the
 * same way.
 */
import type { ChangeKind, FileStatus } from '@shared/ipc'

export interface ChangeEntry {
  path: string
  origPath?: string
  change: ChangeKind
  /** Which side of the index this entry describes. */
  area: 'staged' | 'unstaged'
}

export interface ChangeGroups {
  conflicted: ChangeEntry[]
  staged: ChangeEntry[]
  /** Unstaged changes to tracked files, then untracked (new) files. */
  unstaged: ChangeEntry[]
}

export function groupChanges(files: FileStatus[]): ChangeGroups {
  const groups: ChangeGroups = { conflicted: [], staged: [], unstaged: [] }
  const untracked: ChangeEntry[] = []

  for (const file of files) {
    if (file.unstaged === 'conflicted') {
      groups.conflicted.push({ path: file.path, change: 'conflicted', area: 'unstaged' })
      continue
    }
    if (file.staged) {
      groups.staged.push({
        path: file.path,
        ...(file.origPath ? { origPath: file.origPath } : {}),
        change: file.staged,
        area: 'staged',
      })
    }
    if (file.unstaged) {
      const entry: ChangeEntry = { path: file.path, change: file.unstaged, area: 'unstaged' }
      if (file.unstaged === 'untracked') untracked.push(entry)
      else groups.unstaged.push(entry)
    }
  }

  const byPath = (a: ChangeEntry, b: ChangeEntry) => comparePaths(a.path, b.path)
  groups.conflicted.sort(byPath)
  groups.staged.sort(byPath)
  groups.unstaged = [...groups.unstaged.sort(byPath), ...untracked.sort(byPath)]
  return groups
}

/**
 * Order file paths by folder, then by file name: files directly in a folder
 * come before its subfolders, so each folder's files are listed together:
 *
 *   README.md, src/app.ts, src/main.ts, src/ui/button.tsx, test/app.test.ts
 *
 * Comparing whole paths as text doesn't do this: it puts "src/a/b.ts"
 * between "src/a.ts" and "src/a0.ts", splitting src's own files. Names are
 * compared ignoring case, with numbers in numeric order (file2 before
 * file10).
 */
export function comparePaths(a: string, b: string): number {
  const aSlash = a.lastIndexOf('/')
  const bSlash = b.lastIndexOf('/')
  const aFolder = aSlash === -1 ? [] : a.slice(0, aSlash).split('/')
  const bFolder = bSlash === -1 ? [] : b.slice(0, bSlash).split('/')
  // Folders first, one level at a time; a folder comes before its subfolders.
  for (let i = 0; i < Math.min(aFolder.length, bFolder.length); i++) {
    const order = compareNames(aFolder[i]!, bFolder[i]!)
    if (order) return order
  }
  if (aFolder.length !== bFolder.length) return aFolder.length - bFolder.length
  return compareNames(a.slice(aSlash + 1), b.slice(bSlash + 1))
}

/** Natural, case-insensitive order; falls back to exact order so it's stable. */
function compareNames(a: string, b: string): number {
  return (
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) ||
    (a < b ? -1 : a > b ? 1 : 0)
  )
}

/** Total number of entries, used for the "Changes (N)" counter. */
export function countChanges(groups: ChangeGroups): number {
  return groups.conflicted.length + groups.staged.length + groups.unstaged.length
}
