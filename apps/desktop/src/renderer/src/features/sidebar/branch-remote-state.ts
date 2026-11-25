/**
 * Whether a local branch has a copy on a remote, for the sidebar's
 * "local only" / "gone" markers and the clean-up dialog.
 */
import type { Ref } from '@shared/ipc'
import { remoteBranchShortName } from './group-refs'

/**
 * - tracking: has an upstream branch that still exists.
 * - gone: had an upstream, but it was deleted on the remote (often because
 *   its pull request was merged) and a fetch noticed.
 * - untracked: no upstream set, but a remote has a branch with the same name.
 * - local-only: no copy on any remote (never pushed, as far as we know).
 */
export type BranchRemoteState = 'tracking' | 'gone' | 'untracked' | 'local-only'

/** Work out a local branch's remote state from the repository's refs. */
export function branchRemoteState(
  branch: Pick<Ref, 'name' | 'upstream' | 'upstreamGone'>,
  refs: Ref[],
): BranchRemoteState {
  if (branch.upstreamGone) return 'gone'
  if (branch.upstream) return 'tracking'
  const onRemote = refs.some(
    (r) => r.type === 'remote-branch' && remoteBranchShortName(r) === branch.name,
  )
  return onRemote ? 'untracked' : 'local-only'
}

/** Short label and hover text for each state (tracking has no marker). */
export const REMOTE_STATE_TEXT: Record<BranchRemoteState, { label: string; title: string }> = {
  tracking: { label: '', title: '' },
  gone: {
    label: 'gone',
    title: 'Its remote branch was deleted (maybe its pull request was merged)',
  },
  untracked: {
    label: 'not tracking',
    title: 'A remote has a branch with this name, but this branch doesn’t track it',
  },
  'local-only': { label: 'local', title: 'Not on any remote: never pushed' },
}
