/**
 * Remembers what the user is looking at in each repository tab (History or
 * Changes, the selected commit and file), so switching tabs and coming back
 * keeps your place. Not saved to disk.
 */
import { create } from 'zustand'
import type { DiffTarget, LogScope } from '@shared/ipc'
import type { HistoryFilter } from '@/features/history/history-filter'

/** A file opened for blame or history. */
export interface FileViewState {
  path: string
  mode: 'blame' | 'history'
  /**
   * For blame: older revisions being looked at ("blame before this change"),
   * newest last. Empty means the current working-tree file.
   */
  revisions: { sha: string; path: string }[]
}

/** Two refs being compared: what `head` has that `base` doesn't. */
export interface CompareState {
  base: string
  head: string
}

export interface RepoViewState {
  view: 'history' | 'changes' | 'file' | 'compare'
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
  /** Text in the sidebar's search box (branches, tags, stashes...). */
  sidebarSearch: string
  /** Text in the history search box. */
  search: string
  /** History filter: author, path, dates, code changes (see history-filter.ts). */
  filter: HistoryFilter
  /**
   * Branch whose line of commits stays highlighted in the history graph
   * (full ref name), or null (see features/history/pinned-highlight.ts).
   */
  highlightRef: string | null
  /**
   * Branches given a track in the history timeline (full ref names), or null
   * for the default choice (see features/timeline/timeline-refs.ts).
   */
  timelineRefs: string[] | null
  /** Show branches that were merged and deleted as tracks in the timeline. */
  timelineShowMerged: boolean
  /** Commit message being written (kept while switching tabs). */
  commitSummary: string
  commitDescription: string
  /** Amend the last commit instead of creating a new one. */
  amend: boolean
  /** The file shown in the File view, if any. */
  file: FileViewState | null
  /** The refs shown in the Compare view, if any. */
  compare: CompareState | null
}

const DEFAULT_VIEW: RepoViewState = {
  view: 'history',
  selectedSha: null,
  seekSelected: false,
  selectedFile: null,
  scope: 'all',
  sidebarSearch: '',
  search: '',
  filter: {},
  highlightRef: null,
  timelineRefs: null,
  timelineShowMerged: false,
  commitSummary: '',
  commitDescription: '',
  amend: false,
  file: null,
  compare: null,
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
