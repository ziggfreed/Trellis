/**
 * Remembers what the user is looking at in each repository tab (History or
 * Changes, the selected commit and file), so switching tabs and coming back
 * keeps your place. Not saved to disk.
 */
import { create } from 'zustand'
import type { DiffTarget, LogScope } from '@shared/ipc'

export interface RepoViewState {
  view: 'history' | 'changes'
  /** Selected commit in the history list. */
  selectedSha: string | null
  /**
   * If true and the selected commit isn't loaded yet, the history list keeps
   * loading pages until it finds it (used when jumping to a branch or a
   * search result far back in history).
   */
  seekSelected: boolean
  /** File selected in the commit details or the changes list. */
  selectedFile: DiffTarget | null
  /** Which branches the history shows. */
  scope: LogScope
  /** Text in the history search box. */
  search: string
}

const DEFAULT_VIEW: RepoViewState = {
  view: 'history',
  selectedSha: null,
  seekSelected: false,
  selectedFile: null,
  scope: 'all',
  search: '',
}

interface RepoViewStore {
  byRepo: Record<string, RepoViewState>
  update: (repoPath: string, patch: Partial<RepoViewState>) => void
}

export const useRepoViewStore = create<RepoViewStore>((set) => ({
  byRepo: {},
  update: (repoPath, patch) =>
    set((state) => ({
      byRepo: {
        ...state.byRepo,
        [repoPath]: { ...(state.byRepo[repoPath] ?? DEFAULT_VIEW), ...patch },
      },
    })),
}))

/** The view state for one repository, plus a function to change it. */
export function useRepoView(repoPath: string) {
  const state = useRepoViewStore((s) => s.byRepo[repoPath] ?? DEFAULT_VIEW)
  const update = useRepoViewStore((s) => s.update)
  return [state, (patch: Partial<RepoViewState>) => update(repoPath, patch)] as const
}
