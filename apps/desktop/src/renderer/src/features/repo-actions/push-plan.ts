/**
 * Works out what "Push" should do for the current branch. Pure, so the
 * rules are easy to test:
 *
 * - The branch has an upstream (e.g. origin/main): push to it.
 * - No upstream yet: push to a branch of the same name on "origin" (or the
 *   only remote) and remember it as the upstream (`--set-upstream`).
 * - Detached HEAD or no remotes: explain why we can't push.
 */
import type { BranchStatus, PushRequest, Remote } from '@shared/ipc'

export type PushPlan = { ok: true; request: PushRequest } | { ok: false; reason: string }

export function planPush(branch: BranchStatus, remotes: Remote[]): PushPlan {
  if (!branch.head)
    return {
      ok: false,
      reason: 'You’re not on a branch (detached HEAD), so there’s nothing to push.',
    }
  if (branch.oid === null)
    return { ok: false, reason: 'This branch has no commits yet. Make a commit first.' }

  if (branch.upstream) {
    // An upstream like "origin/feature/x" is "<remote>/<branch>". Match the
    // remote by name, since branch names can contain slashes too.
    const remote = remotes
      .map((r) => r.name)
      .sort((a, b) => b.length - a.length)
      .find((name) => branch.upstream!.startsWith(`${name}/`))
    if (remote) {
      return {
        ok: true,
        request: {
          remote,
          branch: branch.head,
          remoteBranch: branch.upstream.slice(remote.length + 1),
        },
      }
    }
  }

  const remote = remotes.find((r) => r.name === 'origin') ?? remotes[0]
  if (!remote)
    return { ok: false, reason: 'This repository has no remotes to push to. Add one first.' }
  return { ok: true, request: { remote: remote.name, branch: branch.head, setUpstream: true } }
}
