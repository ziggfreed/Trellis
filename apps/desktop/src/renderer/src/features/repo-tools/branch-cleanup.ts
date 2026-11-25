/**
 * Pure logic for the "Clean up branches" dialog (prune-dialog.tsx): sorts
 * the branches main found (CleanupBranch) into groups the user can tick.
 *
 * Branches that are merged are suggested (ticked); branches whose remote
 * was deleted or that were never pushed are shown but left unticked, since
 * they may hold work that isn't anywhere else. Branches still being worked
 * on (unmerged, and on a remote) aren't shown at all.
 */
import type { CleanupBranch, Ref } from '@shared/ipc'
import { branchRemoteState } from '@/features/sidebar/branch-remote-state'

export type CleanupGroupId = 'merged' | 'squashed' | 'remote-deleted' | 'local-only'

export interface CleanupGroup {
  id: CleanupGroupId
  title: string
  description: string
  /** Whether its branches start ticked. */
  suggested: boolean
  branches: CleanupBranch[]
}

/** Group the branches for display; empty groups are left out. */
export function groupCleanup(
  candidates: CleanupBranch[],
  refs: Ref[],
  target: string,
): { groups: CleanupGroup[]; inProgress: number } {
  const groups: CleanupGroup[] = [
    {
      id: 'merged',
      title: `Merged into ${target}`,
      description: `All their commits are on ${target}. Deleting them loses nothing.`,
      suggested: true,
      branches: [],
    },
    {
      id: 'squashed',
      title: `Squash- or rebase-merged into ${target}`,
      description: `Their changes are on ${target}, as different commits (e.g. “Squash and merge” on GitHub).`,
      suggested: true,
      branches: [],
    },
    {
      id: 'remote-deleted',
      title: 'Remote branch deleted, not merged',
      description: `Their remote branch is gone, but some changes aren’t on ${target}. Deleting them may lose work.`,
      suggested: false,
      branches: [],
    },
    {
      id: 'local-only',
      title: 'Never pushed, not merged',
      description: `Only on this computer, with changes that aren’t on ${target}. Deleting them may lose work.`,
      suggested: false,
      branches: [],
    },
  ]
  const byId = new Map(groups.map((g) => [g.id, g]))
  let inProgress = 0
  for (const branch of candidates) {
    const id = groupOf(branch, refs)
    if (id) byId.get(id)!.branches.push(branch)
    else inProgress++
  }
  return { groups: groups.filter((g) => g.branches.length > 0), inProgress }
}

function groupOf(branch: CleanupBranch, refs: Ref[]): CleanupGroupId | null {
  if (branch.merged === 'merged') return 'merged'
  if (branch.merged === 'squashed') return 'squashed'
  const remote = branchRemoteState(branch, refs)
  if (remote === 'gone') return 'remote-deleted'
  if (remote === 'local-only') return 'local-only'
  return null
}

/** The names that start ticked. */
export function suggestedNames(groups: CleanupGroup[]): Set<string> {
  return new Set(groups.filter((g) => g.suggested).flatMap((g) => g.branches.map((b) => b.name)))
}

/**
 * Of the chosen branches, the ones that need `git branch -D`: everything git
 * itself doesn't consider merged (squash-merged ones included).
 */
export function namesToForce(chosen: string[], candidates: CleanupBranch[]): string[] {
  const merged = new Set(candidates.filter((b) => b.merged === 'merged').map((b) => b.name))
  return chosen.filter((name) => !merged.has(name))
}

/** Remote branches to delete, grouped by remote (one push per remote). */
export function byRemote(
  chosen: { remote: string; branch: string }[],
): { remote: string; branches: string[] }[] {
  const map = new Map<string, string[]>()
  for (const { remote, branch } of chosen) map.set(remote, [...(map.get(remote) ?? []), branch])
  return [...map.entries()].map(([remote, branches]) => ({ remote, branches }))
}
