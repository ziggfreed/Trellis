/**
 * Loads live information (currently: the checked-out branch) for a repo, and
 * reloads it whenever the window regains focus, so changes made in a terminal
 * show up when you switch back. A file watcher will replace the focus trick in
 * Phase 1.
 */
import { useEffect, useState } from 'react'
import type { RepoSummary } from '@shared/ipc'
import { api } from '@/lib/api'

export function useRepoSummary(path: string | null) {
  // Results are stored with the path they belong to, so when `path` changes we
  // never show the previous repo's data while the new one loads.
  const [state, setState] = useState<{
    path: string
    summary: RepoSummary | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!path) return
    // Ignore answers that arrive after the user has switched to another repo.
    let cancelled = false
    const load = () => {
      api.invoke('repo:getSummary', path).then(
        (summary) => !cancelled && setState({ path, summary, error: null }),
        (err: unknown) =>
          !cancelled &&
          setState({
            path,
            summary: null,
            error: err instanceof Error ? err.message : String(err),
          }),
      )
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [path])

  const current = state?.path === path ? state : null
  return { summary: current?.summary ?? null, error: current?.error ?? null }
}

/** Human-readable label for HEAD, e.g. "main" or "detached at 1a2b3c4". */
export function describeHead(summary: RepoSummary | null): string | null {
  if (!summary) return null
  const { head } = summary
  return head.kind === 'branch' ? head.name : `detached at ${head.sha.slice(0, 7)}`
}
