/**
 * Opens the interactive rebase editor. Kept in a store so a menu item can
 * open it and the dialog (mounted once in app.tsx) can show it.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import type { Commit } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { shortSha } from '@/lib/format'

export interface RebaseRequest {
  repo: string
  /** Commit to rebase onto, or 'root' to include the first commit. */
  base: string
  /** Commits to edit, oldest first. */
  commits: Commit[]
}

interface RebaseStore {
  request: RebaseRequest | null
  close: () => void
}

export const useRebaseStore = create<RebaseStore>((set) => ({
  request: null,
  close: () => set({ request: null }),
}))

/**
 * Open the editor for `from` and every later commit on the current branch.
 * Checks the commits can be rebased first, explaining if not.
 */
export async function openInteractiveRebase(repo: string, from: Commit) {
  const base = from.parents[0] ?? 'root'
  try {
    const { commits, hasMerges } = await api.invoke('repo:getRebaseCommits', repo, base)
    if (commits[0]?.sha !== from.sha) {
      toast.error(`${shortSha(from.sha)} isn’t on the current branch. Check out its branch first.`)
    } else if (hasMerges) {
      toast.error(
        'These commits include merges, which interactive rebase would flatten. Choose a commit after the last merge.',
      )
    } else {
      useRebaseStore.setState({ request: { repo, base, commits } })
    }
  } catch (error) {
    toast.error(errorMessage(error))
  }
}
