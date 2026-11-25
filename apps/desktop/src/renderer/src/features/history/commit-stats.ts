/**
 * Loads files/lines changed for the commits on screen (the "Changes"
 * column). Stats never change for a given commit, so they're cached for the
 * session and only missing ones are asked for. Requests from rows appearing
 * while scrolling are gathered for a moment and sent together.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { CommitStats } from '@shared/ipc'
import { api } from '@/lib/api'

const useStatsStore = create<{ byRepo: Record<string, Record<string, CommitStats>> }>(() => ({
  byRepo: {},
}))

/** Hashes asked for but not answered yet, per repository. */
const pending = new Map<string, Set<string>>()
/** Hashes waiting for the next batch, per repository. */
const queued = new Map<string, Set<string>>()
let timer: ReturnType<typeof setTimeout> | null = null
const BATCH_DELAY_MS = 60
const BATCH_SIZE = 200

function flush() {
  timer = null
  for (const [repo, shas] of queued) {
    queued.delete(repo)
    const list = [...shas]
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE)
      api
        .invoke('repo:getCommitStats', repo, batch)
        .then((stats) =>
          useStatsStore.setState((s) => ({
            byRepo: { ...s.byRepo, [repo]: { ...s.byRepo[repo], ...stats } },
          })),
        )
        .catch((error: unknown) => console.error('Failed to load commit stats', error))
        // Forget failures too, so scrolling back to them tries again.
        .finally(() => batch.forEach((sha) => pending.get(repo)?.delete(sha)))
    }
  }
}

/** Stats for the given commits, loading any missing ones (when `enabled`). */
export function useCommitStats(repo: string, shas: string[], enabled: boolean) {
  const stats = useStatsStore((s) => s.byRepo[repo])
  const key = shas.join(',')
  useEffect(() => {
    if (!enabled) return
    const known = useStatsStore.getState().byRepo[repo] ?? {}
    const inFlight = pending.get(repo) ?? new Set<string>()
    pending.set(repo, inFlight)
    const missing = key.split(',').filter((sha) => sha && !known[sha] && !inFlight.has(sha))
    if (missing.length === 0) return
    const queue = queued.get(repo) ?? new Set<string>()
    for (const sha of missing) {
      queue.add(sha)
      inFlight.add(sha)
    }
    queued.set(repo, queue)
    timer ??= setTimeout(flush, BATCH_DELAY_MS)
  }, [repo, key, enabled])
  return stats ?? {}
}
