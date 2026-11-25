/**
 * "Find lost commits": the reflog, git's record of everywhere HEAD has
 * been. After a reset, a rebase or deleting a branch, the commits that
 * seem gone are still listed here (for 90 days by default), and can be
 * brought back by creating a branch on them.
 *
 * Open with openReflog(repo) (command palette). Commits on no branch are
 * marked, and can be filtered to.
 */
import { useState } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { GitBranchPlus, History, LocateFixed } from 'lucide-react'
import type { ReflogEntry } from '@shared/ipc'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatRelativeDate, shortSha } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import * as actions from '@/features/repo-actions/actions'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'

const useReflogDialog = create<{ repo: string | null }>(() => ({ repo: null }))

export const openReflog = (repo: string) => useReflogDialog.setState({ repo })
const close = () => useReflogDialog.setState({ repo: null })

/** A short, readable version of git's reflog action. */
export function describeEntry(entry: ReflogEntry): string {
  const text = entry.description
  switch (entry.kind) {
    case 'commit':
    case 'commit (initial)':
    case 'commit (amend)':
    case 'commit (merge)':
      return entry.kind === 'commit' ? 'Committed' : `Committed (${entry.kind.slice(8, -1)})`
    case 'checkout': {
      const match = /^moving from (.+) to (.+)$/.exec(text)
      return match ? `Switched from ${match[1]} to ${match[2]}` : 'Checked out'
    }
    case 'reset':
      return text.replace(/^moving to /, 'Reset to ')
    case 'merge':
      return `Merged ${text.split(':')[0]}`
    case 'pull':
    case 'pull --rebase':
      return 'Pulled'
    case 'cherry-pick':
      return 'Cherry-picked'
    default:
      // e.g. "rebase (finish)", "rebase -i (pick)", "branch: Created from HEAD"
      return `${entry.kind.charAt(0).toUpperCase()}${entry.kind.slice(1)}${text ? `: ${text}` : ''}`
  }
}

export function ReflogDialog() {
  const repo = useReflogDialog((s) => s.repo)
  return (
    <Dialog open={repo !== null} onOpenChange={(open) => !open && close()}>
      {repo && <ReflogContent repo={repo} />}
    </Dialog>
  )
}

function ReflogContent({ repo }: { repo: string }) {
  const [lostOnly, setLostOnly] = useState(false)
  const { data, error, isPending } = useQuery({
    queryKey: ['repo', repo, 'reflog'],
    queryFn: () => api.invoke('repo:getReflog', repo),
  })
  const unreachable = new Set(data?.unreachable ?? [])
  const entries = (data?.entries ?? []).filter((e) => !lostOnly || unreachable.has(e.sha))

  /** Close the dialog first, so the action's own dialog isn't stacked on it. */
  const then = (run: () => unknown) => () => {
    close()
    void run()
  }
  const showInHistory = (sha: string) =>
    useRepoViewStore
      .getState()
      .update(repo, { view: 'history', selectedSha: sha, seekSelected: true, selectedFile: null })

  return (
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl" data-testid="reflog-dialog">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <History className="size-4" />
          Find lost commits
        </DialogTitle>
        <DialogDescription>
          Everywhere this repository has been, newest first (git reflog). Commits marked “not on any
          branch” would be lost eventually: create a branch on one to keep it.
        </DialogDescription>
      </DialogHeader>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={lostOnly} onChange={(e) => setLostOnly(e.target.checked)} />
        Only commits that aren’t on any branch ({unreachable.size})
      </label>
      <div className="min-h-32 flex-1 overflow-y-auto rounded-md border">
        {error ? (
          <p className="p-3 text-sm text-destructive">{errorMessage(error)}</p>
        ) : isPending ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {lostOnly ? 'No lost commits. Everything is on a branch.' : 'No history yet.'}
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const lost = unreachable.has(entry.sha)
              return (
                <li
                  key={entry.selector}
                  className="group flex items-center gap-3 px-3 py-1.5 text-sm"
                  aria-label={`${describeEntry(entry)}: ${entry.subject}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{describeEntry(entry)}</span>
                      {lost && (
                        <span className="shrink-0 rounded bg-change-modified/15 px-1.5 text-xs text-change-modified">
                          not on any branch
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{shortSha(entry.sha)}</span>
                      <span className="truncate">{entry.subject}</span>
                    </div>
                  </div>
                  <span
                    className="w-24 shrink-0 text-right text-xs text-muted-foreground"
                    title={formatDateTime(entry.date)}
                  >
                    {formatRelativeDate(entry.date)}
                  </span>
                  <div
                    className={cn(
                      'flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100',
                      lost && 'opacity-100',
                    )}
                  >
                    {!lost && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={then(() => showInHistory(entry.sha))}
                        title="Show this commit in the history"
                      >
                        <LocateFixed />
                        Show
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant={lost ? 'outline' : 'ghost'}
                      onClick={then(() =>
                        actions.createBranch(repo, { ref: entry.sha, label: shortSha(entry.sha) }),
                      )}
                    >
                      <GitBranchPlus />
                      Create branch…
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </DialogContent>
  )
}
