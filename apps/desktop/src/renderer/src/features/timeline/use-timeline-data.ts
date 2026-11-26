/**
 * Loads what the history timeline draws: which branches get tracks, their
 * commits period by period, when each branch last changed, and how far each
 * is ahead of and behind the main branch.
 *
 * All query keys start with ['repo', path], so they refresh with the rest
 * of the repository's data when files or refs change.
 */
import { useMemo } from 'react'
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query'
import type { Commit } from '@shared/ipc'
import { api } from '@/lib/api'
import { useRefs } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { defaultTimelineRefs, orderTimelineRefs, type TrackRef } from './timeline-refs'
import type { Domain } from './time-scale'
import { useNow } from './use-now'

const DAY = 24 * 60 * 60 * 1000
/** History is loaded this many days at a time, going back as you scroll. */
export const PERIOD = 90 * DAY
/** At most this many commits per period (a busy period continues in the next). */
const PERIOD_LIMIT = 5000

/** The repository's main branch name (e.g. "main"), or null. Shared with other dialogs. */
export function useDefaultBranch(path: string) {
  return useQuery({
    queryKey: ['repo', path, 'default-branch'],
    queryFn: () => api.invoke('repo:getDefaultBranch', path),
  })
}

/** When each branch last had a commit (full ref name -> Unix ms). */
export function useBranchActivity(path: string) {
  return useQuery({
    queryKey: ['repo', path, 'branch-activity'],
    queryFn: () => api.invoke('repo:getBranchActivity', path),
  })
}

/**
 * The branches with a track, in order: the user's choice if they made one
 * in the branch picker, otherwise the default (see timeline-refs.ts).
 */
export function useTimelineRefs(path: string) {
  const [view] = useRepoView(path)
  const refs = useRefs(path).data
  const activity = useBranchActivity(path).data
  const base = useDefaultBranch(path).data ?? null
  const now = useNow()
  const loaded = refs !== undefined && activity !== undefined
  const tracks = useMemo<TrackRef[]>(() => {
    if (!refs || !activity) return []
    return view.timelineRefs
      ? orderTimelineRefs(view.timelineRefs, refs, activity, base)
      : defaultTimelineRefs(refs, activity, base, now)
  }, [refs, activity, base, view.timelineRefs, now])
  return { tracks, refs: refs ?? [], activity: activity ?? {}, base, loaded }
}

/**
 * Commits on `refNames`, newest period first. Call `fetchNextPage` to load
 * the period before the oldest one loaded. `commits` has no duplicates and
 * `domain` is the span of time fully loaded.
 */
export function useTimelineCommits(path: string, refNames: readonly string[]) {
  const sorted = useMemo(() => [...refNames].sort(), [refNames])
  const now = useNow()
  const query = useInfiniteQuery({
    queryKey: ['repo', path, 'timeline', sorted],
    // The newest period runs up to "now" (until: null) so new commits show
    // up when the query refreshes.
    initialPageParam: { since: now - PERIOD, until: null as number | null },
    queryFn: ({ pageParam }) =>
      api.invoke('repo:getTimeline', path, {
        refs: sorted,
        since: pageParam.since,
        until: pageParam.until,
        limit: PERIOD_LIMIT,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? { since: lastPage.from - PERIOD, until: lastPage.from } : undefined,
    enabled: sorted.length > 0,
    // Keep the old tracks on screen while a changed branch selection loads.
    placeholderData: keepPreviousData,
  })

  const pages = query.data?.pages
  const commits = useMemo(() => {
    const seen = new Set<string>()
    const all: Commit[] = []
    for (const page of pages ?? []) {
      for (const commit of page.commits) {
        if (seen.has(commit.sha)) continue // a busy period's last second can repeat
        seen.add(commit.sha)
        all.push(commit)
      }
    }
    return all
  }, [pages])

  const domain = useMemo<Domain>(() => {
    const newest = commits.reduce((max, c) => Math.max(max, c.commitDate), now)
    const last = pages?.at(-1)
    if (!last) return { start: now - PERIOD, end: newest }
    // With nothing older, the history starts at the first commit.
    if (last.hasMore || commits.length === 0) return { start: last.from, end: newest }
    const oldest = commits.reduce((min, c) => Math.min(min, c.commitDate), newest)
    return { start: oldest, end: newest }
  }, [commits, pages, now])

  return { ...query, commits, domain }
}

/** Ahead/behind counts of `heads` against `base` (full ref names). */
export function useAheadBehind(path: string, base: string | null, heads: readonly string[]) {
  const sorted = useMemo(() => [...heads].sort(), [heads])
  return useQuery({
    queryKey: ['repo', path, 'ahead-behind', base, sorted],
    queryFn: () => api.invoke('repo:getAheadBehind', path, base!, sorted),
    enabled: base !== null && sorted.length > 0,
    placeholderData: keepPreviousData,
  })
}
