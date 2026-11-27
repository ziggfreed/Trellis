/**
 * What the status will look like after staging, unstaging or discarding,
 * so the changes lists can update the moment you click instead of waiting
 * for git (staging runs several git commands, which is slow on Windows).
 *
 * It's a best guess: as soon as git finishes, the real status replaces it.
 * Cases that are hard to predict (conflicts, renames when unstaging) are
 * left as they are, which only means those wait for git as before.
 * Pure, so it's unit-tested (optimistic-status.test.ts).
 */
import type { FileStatus, RepoStatus } from '@shared/ipc'

/** Apply `change` to the files at `paths`; null removes a file from the list. */
function update(
  status: RepoStatus,
  paths: readonly string[],
  change: (file: FileStatus) => FileStatus | null,
): RepoStatus {
  const wanted = new Set(paths)
  const files: FileStatus[] = []
  for (const file of status.files) {
    const next = wanted.has(file.path) ? change(file) : file
    if (next && (next.staged || next.unstaged)) files.push(next)
  }
  return { ...status, files }
}

/** After `git add`: the working-tree change moves into the index. */
export function afterStage(status: RepoStatus, paths: readonly string[]): RepoStatus {
  return update(status, paths, (file) => {
    const { staged, unstaged } = file
    if (!unstaged || unstaged === 'conflicted') return file
    // A new file that was then deleted again: nothing left to show.
    if (staged === 'added' && unstaged === 'deleted') return null
    const kind = unstaged === 'untracked' ? 'added' : unstaged
    // An added or renamed file that was edited again stays added/renamed.
    return { ...file, staged: staged && unstaged === 'modified' ? staged : kind, unstaged: null }
  })
}

/** After unstaging: the staged change goes back to being a working-tree change. */
export function afterUnstage(status: RepoStatus, paths: readonly string[]): RepoStatus {
  return update(status, paths, (file) => {
    const { staged, unstaged } = file
    // Unstaging a rename or copy splits it in two; leave that to git.
    if (!staged || staged === 'conflicted' || staged === 'renamed' || staged === 'copied') {
      return file
    }
    // An added file becomes untracked again (whatever its edits since).
    if (staged === 'added') return { ...file, staged: null, unstaged: 'untracked' }
    return { ...file, staged: null, unstaged: unstaged ?? staged }
  })
}

/** After discarding working-tree changes: untracked files go, staged changes stay. */
export function afterDiscard(
  status: RepoStatus,
  files: readonly { path: string; untracked: boolean }[],
): RepoStatus {
  const untracked = new Set(files.filter((f) => f.untracked).map((f) => f.path))
  return update(
    status,
    files.map((f) => f.path),
    (file) => (untracked.has(file.path) ? null : { ...file, unstaged: null }),
  )
}
