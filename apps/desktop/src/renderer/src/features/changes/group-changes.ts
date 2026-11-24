/**
 * Splits the working-tree status into the groups shown in the Changes view.
 *
 * A file can appear in two groups at once: if you stage part of a file and
 * keep editing it, it has both staged and unstaged changes.
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
  /** Unstaged changes to tracked files, followed by untracked files. */
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

  const byPath = (a: ChangeEntry, b: ChangeEntry) => a.path.localeCompare(b.path)
  groups.conflicted.sort(byPath)
  groups.staged.sort(byPath)
  groups.unstaged = [...groups.unstaged.sort(byPath), ...untracked.sort(byPath)]
  return groups
}

/** Total number of entries, used for the "Changes (N)" counter. */
export function countChanges(groups: ChangeGroups): number {
  return groups.conflicted.length + groups.staged.length + groups.unstaged.length
}
