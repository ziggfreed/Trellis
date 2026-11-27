/**
 * Actions on working-tree changes (stage, unstage, discard, stash), shared
 * by the changes list, the hunk view and the command palette.
 */
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { confirmDialog, textDialog } from '@/features/dialogs/dialog-store'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import type { ChangeEntry } from './group-changes'
import type { RepoStatus } from '@shared/ipc'
import { queryClient, repoKeys } from '@/lib/query-client'
import { afterDiscard, afterStage, afterUnstage } from './optimistic-status'

/**
 * Show the expected result in the changes lists straight away (see
 * optimistic-status.ts). Git's real status replaces it when the action
 * finishes; a status refresh already under way is cancelled so it can't
 * briefly bring back the old lists.
 */
async function predictStatus(repoPath: string, next: (status: RepoStatus) => RepoStatus) {
  const key = repoKeys.status(repoPath)
  await queryClient.cancelQueries({ queryKey: key, exact: true })
  queryClient.setQueryData<RepoStatus>(key, (status) => (status ? next(status) : status))
}

/** runAction options for actions that only change working-tree files and the index. */
const WORKING_TREE = { refresh: 'working-tree' } as const

/** If `entry` is the selected file, follow it to the other list after staging/unstaging. */
function followSelection(repoPath: string, paths: string[], to: 'staged' | 'unstaged') {
  const view = useRepoViewStore.getState()
  const selected = view.byRepo[repoPath]?.selectedFile
  if (
    selected &&
    (selected.kind === 'staged' || selected.kind === 'unstaged') &&
    paths.includes(selected.path)
  ) {
    view.update(repoPath, { selectedFile: { kind: to, path: selected.path } })
  }
}

export async function stageEntries(repoPath: string, entries: ChangeEntry[]) {
  const paths = entries.map((e) => e.path)
  if (!paths.length) return
  await predictStatus(repoPath, (status) => afterStage(status, paths))
  followSelection(repoPath, paths, 'staged')
  await runAction(repoPath, () => api.invoke('repo:stage', repoPath, paths), WORKING_TREE)
}

export async function unstageEntries(repoPath: string, entries: ChangeEntry[]) {
  // A rename involves both the old and new path; unstage both.
  const paths = entries.flatMap((e) => (e.origPath ? [e.path, e.origPath] : [e.path]))
  if (!paths.length) return
  await predictStatus(repoPath, (status) => afterUnstage(status, paths))
  followSelection(repoPath, paths, 'unstaged')
  await runAction(repoPath, () => api.invoke('repo:unstage', repoPath, paths), WORKING_TREE)
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
  const files = entries.map((e) => ({ path: e.path, untracked: e.change === 'untracked' }))
  await predictStatus(repoPath, (status) => afterDiscard(status, files))
  await runAction(repoPath, () => api.invoke('repo:discard', repoPath, files), WORKING_TREE)
}

/** Every path git needs for these entries (a rename has an old path too). */
function allPaths(entries: ChangeEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => (e.origPath ? [e.path, e.origPath] : [e.path])))]
}

/**
 * Throw away everything about staged files (staged and unstaged changes),
 * after asking. Files added since the last commit are deleted.
 */
export async function discardStagedEntries(repoPath: string, entries: ChangeEntry[]) {
  if (!entries.length) return
  const added = entries.filter((e) => e.change === 'added').length
  const what = entries.length === 1 ? entries[0]!.path : `${entries.length} files`
  const ok = await confirmDialog({
    title: `Discard all changes to ${what}?`,
    description:
      'Their staged and unstaged changes will be lost, putting them back to the last commit.' +
      (added
        ? `\n${added === 1 ? 'A file added since then' : `${added} files added since then`} will be deleted.`
        : ''),
    confirmLabel: 'Discard',
    destructive: true,
  })
  if (!ok) return
  await runAction(
    repoPath,
    () => api.invoke('repo:discardAll', repoPath, allPaths(entries)),
    WORKING_TREE,
  )
}

/**
 * Put some files aside in a stash (both their staged and unstaged changes),
 * leaving the other files as they are. Asks for an optional message first.
 */
export async function stashEntries(repoPath: string, entries: ChangeEntry[]) {
  if (!entries.length) return
  const what = entries.length === 1 ? entries[0]!.path : `${entries.length} files`
  const message = await textDialog({
    title: `Stash ${what}`,
    description:
      'Put these files’ changes (staged and unstaged) aside for later; the other files stay as they are. Apply the stash again from the sidebar’s Stashes section.',
    label: 'Message (optional)',
    optional: true,
    confirmLabel: 'Stash',
  })
  if (message === null) return
  const created = await runAction(repoPath, () =>
    api.invoke('repo:stash', repoPath, {
      message: message.trim(),
      includeUntracked: entries.some((e) => e.change === 'untracked'),
      paths: allPaths(entries),
    }),
  )
  if (created === false) toast.info('There were no changes to stash.')
  else if (created) toast.success(`Stashed ${what}`)
}
