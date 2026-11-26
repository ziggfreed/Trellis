/**
 * Pinning a branch's highlight in the history graph.
 *
 * Hovering a branch label highlights that branch's line of commits (see
 * branch-highlight.ts), but only while the pointer stays on the label, so
 * you can't scroll along the line. Pinning keeps it highlighted until it's
 * cleared: click a label, or choose "Highlight in history" from a branch's
 * right-click menu. A bar above the commit list shows what's pinned.
 */
import type { Ref } from '@shared/ipc'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'
import { useSettingsStore } from '@/features/settings/settings-store'

/** Pin `ref`'s highlight, or clear it if it's already pinned. */
export function togglePinnedHighlight(repoPath: string, ref: Ref): void {
  const current = useRepoViewStore.getState().byRepo[repoPath]?.highlightRef ?? null
  useRepoViewStore
    .getState()
    .update(repoPath, { highlightRef: current === ref.fullName ? null : ref.fullName })
}

/** Clear the pinned highlight. */
export function clearPinnedHighlight(repoPath: string): void {
  useRepoViewStore.getState().update(repoPath, { highlightRef: null })
}

/**
 * Pin `ref`'s highlight from elsewhere (a sidebar menu): show the history as
 * the graph, and select the branch's commit so the list scrolls to it.
 */
export function highlightInHistory(repoPath: string, ref: Ref): void {
  useSettingsStore.getState().update({ historyView: 'graph' })
  useRepoViewStore.getState().update(repoPath, {
    view: 'history',
    highlightRef: ref.fullName,
    selectedSha: ref.sha,
    seekSelected: true,
    selectedFile: null,
  })
}
