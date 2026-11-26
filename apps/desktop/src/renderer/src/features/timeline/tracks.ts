/**
 * Lays out the timeline: which track (horizontal row) each commit sits on,
 * and the lines between commits.
 *
 * Git doesn't record which branch a commit was made on, so tracks are
 * worked out:
 *  1. Each shown branch, in order, claims its first-parent line: start at
 *     the branch's commit and follow first parents until reaching a commit
 *     an earlier track already claimed (where the branch forked off) or the
 *     edge of the loaded history. This is the same line the vertical graph
 *     draws for a branch, and it means `main` gets main's own commits even
 *     though every feature branch also contains them.
 *  2. Branches that were merged and deleted have no ref, but the merge
 *     commit remembers them: its second parent is the branch's last commit,
 *     and its message usually names it ("Merge branch 'login'", "Merge pull
 *     request #12 from owner/login"). With "Show merged branches" on, each
 *     such branch gets a track named from the message. They share rows when
 *     their lifetimes don't overlap, which keeps the view compact.
 *  3. Commits still unclaimed (only reachable through merged branches when
 *     those are hidden) aren't shown; the merge commit gets a short stub so
 *     you can see something was merged there.
 */
import type { Commit } from '@shared/ipc'
import type { TrackRef } from './timeline-refs'

export interface Track {
  /** The branch's full ref name, or "merged:<merge commit>" for a merged branch. */
  id: string
  name: string
  /** The branch, or null for a merged branch that no longer exists. */
  ref: TrackRef | null
  /** Row (0 at the top). Merged branches can share a row. */
  row: number
  /** Index into the --graph-N colours. */
  color: number
  /** Hashes of this track's commits, oldest first. */
  commits: string[]
  /**
   * Where the branch's own commit is:
   * - "own": on this track;
   * - "shared": on another track (the branch has no commits of its own,
   *   e.g. just created, or fast-forward merged);
   * - "outside": not loaded (older than the loaded history).
   */
  tip: 'own' | 'shared' | 'outside'
  /** The merge commit that brought a merged branch in. */
  mergedInto?: string
}

export interface TimelineEdge {
  /** Parent commit. */
  from: string
  /** Child commit. */
  to: string
  /**
   * "line": along one track; "fork": a branch's first commit leaving its
   * parent's track; "merge": a second parent joining a merge commit.
   */
  kind: 'line' | 'fork' | 'merge'
  /** Colour index of the line. */
  color: number
}

export interface TimelineStub {
  sha: string
  /**
   * "before": the commit's parent is older than the loaded history;
   * "merged": the commit merged in a branch that isn't shown.
   */
  kind: 'before' | 'merged'
}

export interface TimelineModel {
  tracks: Track[]
  /** Number of rows (named tracks plus shared rows for merged branches). */
  rows: number
  /** Row of the first shared "Merged branches" row, or null if there are none. */
  mergedRowStart: number | null
  /** Shown commits: hash -> commit and its track's index in `tracks`. */
  placed: Map<string, { commit: Commit; track: number }>
  edges: TimelineEdge[]
  stubs: TimelineStub[]
}

const PALETTE_SIZE = 8
/** Merged branches sharing a row need at least this much time between them. */
const ROW_SHARING_GAP = 12 * 60 * 60 * 1000

/**
 * The branch a merge commit's message says it merged, or null if the
 * message doesn't follow a known pattern.
 */
export function mergedBranchName(subject: string): string | null {
  // GitHub: "Merge pull request #12 from owner/branch-name"
  const pr = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject)
  if (pr) return `${pr[2]} (#${pr[1]})`
  // git (and GitLab): "Merge branch 'login' into main", "Merge branch 'login' of https://..."
  const branch = /^Merge branch '([^']+)'/.exec(subject)
  if (branch) return branch[1]!
  // git: "Merge remote-tracking branch 'origin/login'"
  const remote = /^Merge remote-tracking branch '(?:[^'/]+\/)?([^']+)'/.exec(subject)
  if (remote) return remote[1]!
  // Bitbucket: "Merged in login (pull request #7)"
  const bitbucket = /^Merged in (\S+)(?: \(pull request #(\d+)\))?/.exec(subject)
  if (bitbucket) return bitbucket[2] ? `${bitbucket[1]} (#${bitbucket[2]})` : bitbucket[1]!
  return null
}

/** Lay out `commits` on tracks for `refs` (in order, top first). */
export function buildTimeline(
  commits: readonly Commit[],
  refs: readonly TrackRef[],
  options: { showMerged: boolean },
): TimelineModel {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]))
  const claimed = new Map<string, number>()
  const tracks: Track[] = []

  /** Claim `start`'s first-parent line for track `index`; returns the commits, newest first. */
  const walk = (start: string, index: number): string[] => {
    const line: string[] = []
    let sha: string | undefined = start
    while (sha !== undefined && bySha.has(sha) && !claimed.has(sha)) {
      claimed.set(sha, index)
      line.push(sha)
      sha = bySha.get(sha)!.parents[0]
    }
    return line
  }

  // 1. A track per shown branch.
  for (const ref of refs) {
    const index = tracks.length
    const tip = !bySha.has(ref.sha) ? 'outside' : claimed.has(ref.sha) ? 'shared' : 'own'
    const line = tip === 'own' ? walk(ref.sha, index) : []
    tracks.push({
      id: ref.fullName,
      name: ref.name,
      ref,
      row: index,
      color: index % PALETTE_SIZE,
      commits: line.reverse(),
      tip,
    })
  }
  const named = tracks.length

  // 2. Merged branches, found through the merge commits on shown tracks
  //    (newest merge first, so names and colours are stable as history loads).
  if (options.showMerged) {
    const byDateDesc = (a: string, b: string) => bySha.get(b)!.commitDate - bySha.get(a)!.commitDate
    const merges = [...claimed.keys()].filter((sha) => bySha.get(sha)!.parents.length > 1)
    merges.sort(byDateDesc)
    for (let i = 0; i < merges.length; i++) {
      const merge = bySha.get(merges[i]!)!
      for (const parent of merge.parents.slice(1)) {
        if (!bySha.has(parent) || claimed.has(parent)) continue
        const index = tracks.length
        const line = walk(parent, index)
        tracks.push({
          id: `merged:${merge.sha}:${parent}`,
          name: mergedBranchName(merge.subject) ?? 'merged branch',
          ref: null,
          row: -1, // packed below
          color: index % PALETTE_SIZE,
          commits: line.reverse(),
          tip: 'own',
          mergedInto: merge.sha,
        })
        // The merged branch may itself contain merges of other branches.
        merges.push(...line.filter((sha) => bySha.get(sha)!.parents.length > 1))
      }
    }
  }

  // Pack merged branches into shared rows below the named tracks: each goes
  // in the first row where it doesn't overlap the previous branch in time.
  const rowEnds: number[] = []
  const span = (track: Track) => {
    const first = bySha.get(track.commits[0]!)!
    const forkParent = bySha.get(first.parents[0] ?? '')
    const start = Math.min(first.commitDate, forkParent?.commitDate ?? Infinity)
    const end = bySha.get(track.mergedInto!)!.commitDate
    return { start, end: Math.max(start, end) }
  }
  const merged = tracks.slice(named).map((track) => ({ track, ...span(track) }))
  merged.sort((a, b) => a.start - b.start)
  for (const { track, start, end } of merged) {
    let row = rowEnds.findIndex((rowEnd) => rowEnd + ROW_SHARING_GAP <= start)
    if (row === -1) row = rowEnds.push(end) - 1
    else rowEnds[row] = end
    track.row = named + row
  }

  // Lines between shown commits.
  const placed = new Map<string, { commit: Commit; track: number }>()
  for (const [sha, track] of claimed) placed.set(sha, { commit: bySha.get(sha)!, track })
  const edges: TimelineEdge[] = []
  const stubs: TimelineStub[] = []
  for (const { commit, track } of placed.values()) {
    commit.parents.forEach((parent, i) => {
      const from = placed.get(parent)
      if (from) {
        const kind = i > 0 ? 'merge' : from.track === track ? 'line' : 'fork'
        // A merge line has the colour of the branch coming in; a fork line
        // the colour of the branch going out.
        const color = tracks[kind === 'merge' ? from.track : track]!.color
        edges.push({ from: parent, to: commit.sha, kind, color })
      } else if (i === 0 && !bySha.has(parent)) {
        stubs.push({ sha: commit.sha, kind: 'before' })
      } else if (i > 0 && bySha.has(parent)) {
        stubs.push({ sha: commit.sha, kind: 'merged' })
      }
    })
  }

  return {
    tracks,
    rows: named + rowEnds.length,
    mergedRowStart: rowEnds.length > 0 ? named : null,
    placed,
    edges,
    stubs,
  }
}
