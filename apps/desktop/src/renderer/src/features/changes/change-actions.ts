/**
 * Actions on working-tree changes (stage, unstage, discard), shared by the
 * changes list, the hunk view and the command palette.
 */
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { confirmDialog } from '@/features/dialogs/dialog-store'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import type { ChangeEntry } from './group-changes'

/** If `entry` is the selected file, follow it to the other list after staging/unstaging. */
function followSelection(repoPath: string, paths: string[], to: 'staged' | 'unstaged') {
  const view = useRepoViewStore.getState()
  const selected = view.byRepo[repoPath]?.selectedFile
  if (selected && selected.kind !== 'commit' && paths.includes(selected.path)) {
    view.update(repoPath, { selectedFile: { kind: to, path: selected.path } })
  }
}

export async function stageEntries(repoPath: string, entries: ChangeEntry[]) {
  const paths = entries.map((e) => e.path)
  if (!paths.length) return
  await runAction(repoPath, () => api.invoke('repo:stage', repoPath, paths))
  followSelection(repoPath, paths, 'staged')
}

export async function unstageEntries(repoPath: string, entries: ChangeEntry[]) {
  // A rename involves both the old and new path; unstage both.
  const paths = entries.flatMap((e) => (e.origPath ? [e.path, e.origPath] : [e.path]))
  if (!paths.length) return
  await runAction(repoPath, () => api.invoke('repo:unstage', repoPath, paths))
  followSelection(repoPath, paths, 'unstaged')
}

/** Discard changes after asking for confirmation (this can't be undone). */
export async function discardEntries(repoPath: string, entries: ChangeEntry[]) {
  if (!entries.length) return
  const untracked = entries.filter((e) => e.change === 'untracked').length
  const what = entries.length === 1 ? entries[0]!.path : `${entries.length} files`
  const ok = await confirmDialog({
    title: `Discard changes to ${what}?`,
    description:
      'Your unstaged changes will be lost. This can’t be undone.' +
      (untracked
        ? `\n${untracked === 1 ? 'An untracked file' : `${untracked} untracked files`} will be deleted.`
        : ''),
    confirmLabel: 'Discard',
    destructive: true,
  })
  if (!ok) return
  await runAction(repoPath, () =>
    api.invoke(
      'repo:discard',
      repoPath,
      entries.map((e) => ({ path: e.path, untracked: e.change === 'untracked' })),
    ),
  )
}
