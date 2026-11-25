/**
 * What double-clicking checks out, in the history and the sidebar.
 *
 * Double-clicking a commit prefers a branch over a bare commit, so the user
 * ends up on a branch they can commit to, not in "detached HEAD":
 *   1. a local branch at that commit;
 *   2. else a remote branch at that commit, as a new local branch (only if
 *      no local branch has its name: switching to that one would land on a
 *      different commit than the one clicked);
 *   3. else the commit itself (detached; actions.ts asks first).
 * Double-clicking a branch label checks out that branch.
 */
import type { Ref } from '@shared/ipc'
import { remoteBranchShortName } from '@/features/sidebar/group-refs'

export type CheckoutChoice =
  /** Already checked out: nothing to do. */
  | { kind: 'current'; label: string }
  | { kind: 'branch'; name: string }
  /** Switch to (creating if needed) the local branch for this remote branch. */
  | { kind: 'remote-branch'; ref: Ref }
  | { kind: 'commit'; sha: string }

/**
 * Choose what to check out for a double-clicked commit.
 * `headSha` is the checked-out commit (null for an empty repository).
 */
export function checkoutChoiceForCommit(
  sha: string,
  refs: Ref[],
  headSha: string | null,
): CheckoutChoice {
  const here = refs.filter((r) => r.sha === sha)
  const locals = here.filter((r) => r.type === 'branch')
  const head = locals.find((r) => r.isHead)
  if (head) return { kind: 'current', label: head.name }
  const local = locals[0]
  if (local) return { kind: 'branch', name: local.name }

  const localNames = new Set(refs.filter((r) => r.type === 'branch').map((r) => r.name))
  const remote = here.find(
    (r) => r.type === 'remote-branch' && !localNames.has(remoteBranchShortName(r)),
  )
  if (remote) return { kind: 'remote-branch', ref: remote }

  if (sha === headSha) return { kind: 'current', label: 'this commit' }
  return { kind: 'commit', sha }
}

/** Choose what to check out for a double-clicked branch or tag label. */
export function checkoutChoiceForRef(ref: Ref, refs: Ref[]): CheckoutChoice {
  if (ref.type === 'branch') {
    return ref.isHead ? { kind: 'current', label: ref.name } : { kind: 'branch', name: ref.name }
  }
  if (ref.type === 'remote-branch') {
    // Its local branch may already exist, and even be checked out.
    const localName = remoteBranchShortName(ref)
    const local = refs.find((r) => r.type === 'branch' && r.name === localName)
    if (local?.isHead) return { kind: 'current', label: local.name }
    return { kind: 'remote-branch', ref }
  }
  return { kind: 'commit', sha: ref.sha }
}
