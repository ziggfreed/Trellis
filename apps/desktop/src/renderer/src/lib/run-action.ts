/**
 * Runs a user action that changes a repository, then refreshes its data.
 *
 *   await runAction(repoPath, () => api.invoke('repo:stage', repoPath, files))
 *
 * - Errors are shown as a toast with git's message (and also returned as
 *   `undefined`, so callers can just `await` without try/catch).
 * - Merge-like results with conflicts show a warning explaining what to do.
 * - All cached data for the repository is refreshed afterwards. (The file
 *   watcher would do this too, but doing it immediately feels snappier.)
 *   Actions that only touch working-tree files and the index (staging,
 *   discarding) pass `refresh: 'working-tree'` to refresh just the status,
 *   diffs and undo state: far fewer git commands than reloading branches,
 *   stashes, remotes and the rest.
 * - With `pending`, a loading toast shows straight away and turns into the
 *   success or error message when the action ends.
 */
import { toast } from 'sonner'
import type { MergeResult } from '@shared/ipc'
import { queryClient, repoKeys } from './query-client'
import { errorMessage } from './errors'

export interface ActionOptions {
  /** Toast to show when the action succeeds. */
  success?: string
  /**
   * Toast to show while the action runs, e.g. "Switching to main…". For
   * actions started by a double-click, which otherwise show nothing until
   * git finishes: that can take seconds in a big repository, or while a
   * background fetch holds the repository's write queue, and the click
   * looks like it didn't register.
   */
  pending?: string
  /** What to refresh afterwards: everything (default), or only what staging/discarding can change. */
  refresh?: 'all' | 'working-tree'
}

function isMergeResult(value: unknown): value is MergeResult {
  return typeof value === 'object' && value !== null && 'status' in value
}

export async function runAction<T>(
  repoPath: string,
  action: () => Promise<T>,
  options: ActionOptions = {},
): Promise<T | undefined> {
  // Reusing the loading toast's id makes the result replace it in place.
  const toastId = options.pending ? toast.loading(options.pending) : undefined
  const sameToast = toastId === undefined ? {} : { id: toastId }
  let refreshed = false
  try {
    const result = await action()
    if (toastId !== undefined) {
      // Say it's done only once the branch list and status show it, so the
      // message and the UI change together. The rest refreshes below.
      await refresh(repoPath, true)
      refreshed = true
    }
    if (isMergeResult(result) && result.status === 'conflicts') {
      toast.warning('There are conflicts', {
        ...sameToast,
        description: 'Resolve the conflicted files in the Changes view, stage them, then continue.',
      })
    } else if (options.success) {
      toast.success(options.success, sameToast)
    } else if (toastId !== undefined) {
      toast.dismiss(toastId)
    }
    return result
  } catch (error) {
    toast.error(errorMessage(error), { ...sameToast, duration: 10_000 })
    return undefined
  } finally {
    if (options.refresh === 'working-tree') refreshWorkingTree(repoPath)
    else if (!refreshed) void refresh(repoPath, false)
  }
}

/** Refresh what changes when files are staged, unstaged or discarded. */
function refreshWorkingTree(repoPath: string): void {
  void queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath), exact: true })
  void queryClient.invalidateQueries({ queryKey: repoKeys.summary(repoPath), exact: true })
  void queryClient.invalidateQueries({ queryKey: [...repoKeys.all(repoPath), 'diff'] })
  void queryClient.invalidateQueries({ queryKey: [...repoKeys.all(repoPath), 'undo'], exact: true })
}

/**
 * Refresh the repository's cached data. With `waitForRefs`, waits until the
 * refs and status have reloaded (the history and the rest reload in the
 * background); otherwise refreshes everything without waiting.
 */
async function refresh(repoPath: string, waitForRefs: boolean): Promise<void> {
  if (!waitForRefs) {
    void queryClient.invalidateQueries({ queryKey: repoKeys.all(repoPath) })
    return
  }
  const quick = [repoKeys.refs(repoPath), repoKeys.status(repoPath)].map((key) =>
    JSON.stringify(key),
  )
  void queryClient.invalidateQueries({
    queryKey: repoKeys.all(repoPath),
    predicate: (query) => !quick.includes(JSON.stringify(query.queryKey)),
  })
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: repoKeys.refs(repoPath), exact: true }),
    queryClient.invalidateQueries({ queryKey: repoKeys.status(repoPath), exact: true }),
  ])
}
