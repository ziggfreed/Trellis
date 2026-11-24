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
 */
import { toast } from 'sonner'
import type { MergeResult } from '@shared/ipc'
import { queryClient, repoKeys } from './query-client'
import { errorMessage } from './errors'

export interface ActionOptions {
  /** Toast to show when the action succeeds. */
  success?: string
}

function isMergeResult(value: unknown): value is MergeResult {
  return typeof value === 'object' && value !== null && 'status' in value
}

export async function runAction<T>(
  repoPath: string,
  action: () => Promise<T>,
  options: ActionOptions = {},
): Promise<T | undefined> {
  try {
    const result = await action()
    if (isMergeResult(result) && result.status === 'conflicts') {
      toast.warning('There are conflicts', {
        description: 'Resolve the conflicted files in the Changes view, stage them, then continue.',
      })
    } else if (options.success) {
      toast.success(options.success)
    }
    return result
  } catch (error) {
    toast.error(errorMessage(error), { duration: 10_000 })
    return undefined
  } finally {
    void queryClient.invalidateQueries({ queryKey: repoKeys.all(repoPath) })
  }
}
