/**
 * Remembers what the user is looking at in each repository tab (History or
 * Changes, the selected commit and file), so switching tabs and coming back
 * keeps your place. Not saved to disk.
 */
import { create } from 'zustand'
import type { DiffTarget } from '@shared/ipc'

export interface RepoViewState {
  view: 'history' | 'changes'
  /** Selected commit in the history list. */
  selectedSha: string | null
  /** File selected in the commit details or the changes list. */
  selectedFile: DiffTarget | null
}

const DEFAULT_VIEW: RepoViewState = { view: 'history', selectedSha: null, selectedFile: null }

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
