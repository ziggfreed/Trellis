/**
 * Shows a "Merge feature…" notice while a slow operation runs.
 *
 * The main process reports write operations that are still running after a
 * moment (main/services/repo-queue.ts); this turns each into a loading
 * toast, removed when the operation ends. Actions that already show their
 * own message while they run (runAction's `pending`, e.g. "Switching to
 * main…") are skipped, so there's never two. Network operations show their
 * progress in the status bar instead and aren't reported here.
 *
 * Mount once, near the top of the app.
 */
import { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { hasPendingNotice } from '@/lib/run-action'
import { useSettingsStore } from '@/features/settings/settings-store'

/** The repository's name if it isn't the tab on screen (else undefined). */
function backgroundTabName(path: string): string | undefined {
  const { openTabs, activeTab } = useSettingsStore.getState().settings
  return path === activeTab ? undefined : openTabs.find((tab) => tab.path === path)?.name
}

export function useBusyNotices() {
  useEffect(
    () =>
      api.on('repo:busy', ({ id, repoPath, label }) => {
        const toastId = `busy-${id}`
        if (label === null) {
          toast.dismiss(toastId)
          return
        }
        if (hasPendingNotice(repoPath)) return
        // Name the repository when it's in another tab, so the notice is clear.
        const repoName = backgroundTabName(repoPath)
        toast.loading(`${label}…`, { id: toastId, ...(repoName ? { description: repoName } : {}) })
      }),
    [],
  )
}
