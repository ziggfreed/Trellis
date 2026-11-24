/**
 * Pure helpers that organise branches and tags for display.
 */
import type { Ref, Remote } from '@shared/ipc'

export interface RemoteGroup {
  remote: string
  branches: Ref[]
}

/**
 * Group remote branches under their remote. Remotes with no branches yet
 * (e.g. never fetched) still appear, so the user can see they exist.
 */
export function groupRemoteBranches(refs: Ref[], remotes: Remote[]): RemoteGroup[] {
  const groups = new Map<string, Ref[]>(remotes.map((r) => [r.name, []]))
  for (const ref of refs) {
    if (ref.type !== 'remote-branch' || !ref.remote) continue
    const list = groups.get(ref.remote) ?? []
    list.push(ref)
    groups.set(ref.remote, list)
  }
  return [...groups.entries()]
    .map(([remote, branches]) => ({ remote, branches: sortByName(branches) }))
    .sort((a, b) => a.remote.localeCompare(b.remote))
}

/** Local branches, with the checked-out branch first and the rest by name. */
export function localBranches(refs: Ref[]): Ref[] {
  const branches = sortByName(refs.filter((r) => r.type === 'branch'))
  return [...branches.filter((b) => b.isHead), ...branches.filter((b) => !b.isHead)]
}

/**
 * Tags, newest version first. Uses "natural" ordering so v1.10 sorts after
 * v1.9 (plain alphabetical order would put it before).
 */
export function sortedTags(refs: Ref[]): Ref[] {
  return refs
    .filter((r) => r.type === 'tag')
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
}

/** Remove the remote's prefix: "origin/feature/x" -> "feature/x". */
export function remoteBranchShortName(ref: Ref): string {
  return ref.remote ? ref.name.slice(ref.remote.length + 1) : ref.name
}

/** Map each commit hash to the refs pointing at it (for badges in the history). */
export function refsBySha(refs: Ref[]): Map<string, Ref[]> {
  const map = new Map<string, Ref[]>()
  for (const ref of refs) {
    const list = map.get(ref.sha)
    if (list) list.push(ref)
    else map.set(ref.sha, [ref])
  }
  // Show the checked-out branch first, then local branches, remote branches and tags.
  const rank = (r: Ref) =>
    r.isHead ? 0 : r.type === 'branch' ? 1 : r.type === 'remote-branch' ? 2 : 3
  for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b))
  return map
}

function sortByName(refs: Ref[]): Ref[] {
  return [...refs].sort((a, b) => a.name.localeCompare(b.name))
}
