/**
 * Which branches the timeline gives a track, in what order, and which are
 * "stale".
 *
 * By default the timeline shows every local branch, plus remote branches
 * that had commits recently and that no local branch already stands for
 * (so `main` and `origin/main` don't take two tracks). The user can instead
 * pick exactly which branches to show (the branch picker in the toolbar).
 *
 * Tracks are ordered: the main branch first, then the checked-out branch,
 * then the rest with the most recently changed first.
 */
import type { Ref } from '@shared/ipc'

const DAY = 24 * 60 * 60 * 1000

/** A branch with no commits for this long is drawn faded. */
export const STALE_DAYS = 30
/** Remote branches are shown by default if they had a commit this recently. */
export const ACTIVE_DAYS = 14
/** At most this many tracks by default (the picker can show more). */
export const MAX_DEFAULT_TRACKS = 20

/** A branch that has a track on the timeline. */
export interface TrackRef {
  /** Full name, e.g. "refs/heads/main". */
  fullName: string
  /** Display name, e.g. "main" or "origin/feature". */
  name: string
  /** The commit the branch points at. */
  sha: string
  type: 'branch' | 'remote-branch'
}

/** Branches (local and remote) that can have a track, i.e. not tags. */
export function trackableRefs(refs: readonly Ref[]): Ref[] {
  return refs.filter((ref) => ref.type === 'branch' || ref.type === 'remote-branch')
}

/** Full ref name of a local branch name such as "main". */
export const localRefName = (branch: string) => `refs/heads/${branch}`

/**
 * True if a local branch already represents this remote branch: it tracks
 * it, or has the same name ("feature" for "origin/feature").
 */
function coveredByLocal(remote: Ref, locals: readonly Ref[]): boolean {
  const shortName = remote.remote ? remote.name.slice(remote.remote.length + 1) : remote.name
  return locals.some((local) => local.upstream === remote.name || local.name === shortName)
}

/**
 * Put branch full names in track order: main branch, checked-out branch,
 * then most recently active first (ties by name). Names that aren't
 * branches in `refs` are dropped.
 */
export function orderTimelineRefs(
  fullNames: readonly string[],
  refs: readonly Ref[],
  activity: Readonly<Record<string, number>>,
  base: string | null,
): TrackRef[] {
  const byName = new Map(trackableRefs(refs).map((ref) => [ref.fullName, ref]))
  const baseName = base ? localRefName(base) : null
  const rank = (ref: Ref) => (ref.fullName === baseName ? 0 : ref.isHead ? 1 : 2)
  return [...new Set(fullNames)]
    .map((name) => byName.get(name))
    .filter((ref): ref is Ref => ref !== undefined)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (activity[b.fullName] ?? 0) - (activity[a.fullName] ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .map((ref) => ({
      fullName: ref.fullName,
      name: ref.name,
      sha: ref.sha,
      type: ref.type as TrackRef['type'],
    }))
}

/**
 * The branches shown when the user hasn't picked any: local branches and
 * recently active remote branches, ordered, at most MAX_DEFAULT_TRACKS
 * (the main and checked-out branches are always kept).
 */
export function defaultTimelineRefs(
  refs: readonly Ref[],
  activity: Readonly<Record<string, number>>,
  base: string | null,
  now: number,
): TrackRef[] {
  const locals = refs.filter((ref) => ref.type === 'branch')
  const activeRemotes = refs.filter(
    (ref) =>
      ref.type === 'remote-branch' &&
      (activity[ref.fullName] ?? 0) >= now - ACTIVE_DAYS * DAY &&
      !coveredByLocal(ref, locals),
  )
  const ordered = orderTimelineRefs(
    [...locals, ...activeRemotes].map((ref) => ref.fullName),
    refs,
    activity,
    base,
  )
  // The order already puts main and the checked-out branch first, so
  // cutting from the end keeps them.
  return ordered.slice(0, MAX_DEFAULT_TRACKS)
}

/**
 * True if a branch hasn't had a commit for STALE_DAYS. The main branch and
 * the checked-out branch are never stale (they're what you're working on).
 */
export function isStale(
  ref: Pick<TrackRef, 'fullName'>,
  activity: Readonly<Record<string, number>>,
  options: { base: string | null; head: string | null; now: number },
): boolean {
  if (ref.fullName === (options.base && localRefName(options.base))) return false
  if (ref.fullName === (options.head && localRefName(options.head))) return false
  const last = activity[ref.fullName]
  return last !== undefined && last < options.now - STALE_DAYS * DAY
}
