/**
 * The commit message box under the changes list.
 *
 * - Summary (first line) and an optional description.
 * - "Amend" replaces the last commit; ticking it fills in that commit's message.
 * - Ctrl/Cmd+Enter commits.
 * The draft is kept per repository while you switch tabs.
 */
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { shortSha } from '@/lib/format'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { modKey } from '@/hooks/use-keyboard-shortcuts'
import {
  buildCommitMessage,
  splitCommitMessage,
  SUMMARY_HARD_LIMIT,
  summaryLength,
} from './commit-message'

export function CommitBox({ repoPath }: { repoPath: string }) {
  const [view, setView] = useRepoView(repoPath)
  const status = useStatus(repoPath).data
  const stagedCount = status?.files.filter((f) => f.staged).length ?? 0
  const branch = status?.branch.head ?? 'detached HEAD'
  const hasCommits = status?.branch.oid != null

  const canCommit =
    view.commitSummary.trim() !== '' &&
    (stagedCount > 0 || view.amend || status?.operation === 'merge')
  const length = summaryLength(view.commitSummary)

  const toggleAmend = async (amend: boolean) => {
    setView({ amend })
    // Pre-fill the last commit's message, unless the user has already typed one.
    if (amend && !view.commitSummary.trim() && !view.commitDescription.trim()) {
      const message = await api.invoke('repo:getHeadMessage', repoPath)
      if (message) {
        const { summary, description } = splitCommitMessage(message)
        setView({ commitSummary: summary, commitDescription: description })
      }
    }
  }

  const commit = async () => {
    if (!canCommit) return
    const message = buildCommitMessage(view.commitSummary, view.commitDescription)
    const sha = await runAction(repoPath, () =>
      api.invoke('repo:commit', repoPath, message, { amend: view.amend }),
    )
    if (sha) {
      toast.success(`${view.amend ? 'Amended' : 'Committed'} ${shortSha(sha)}`)
      setView({ commitSummary: '', commitDescription: '', amend: false })
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void commit()
    }
  }

  const label = view.amend
    ? 'Amend last commit'
    : stagedCount === 0
      ? 'Stage files to commit'
      : `Commit ${stagedCount} ${stagedCount === 1 ? 'file' : 'files'} to ${branch}`

  return (
    <div className="space-y-2 border-t p-3" onKeyDown={onKeyDown}>
      <div className="relative">
        <input
          aria-label="Commit summary"
          placeholder="Summary (required)"
          value={view.commitSummary}
          onChange={(e) => setView({ commitSummary: e.target.value })}
          className="h-8 w-full rounded-md border border-input bg-background pr-10 pl-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <span
          title={`Keep the summary under ${SUMMARY_HARD_LIMIT} characters`}
          className={cn(
            'absolute top-1/2 right-2 -translate-y-1/2 text-xs tabular-nums',
            length === 'ok' && 'text-muted-foreground',
            length === 'long' && 'text-change-modified',
            length === 'too-long' && 'text-destructive',
          )}
        >
          {view.commitSummary.trim().length || ''}
        </span>
      </div>
      <textarea
        aria-label="Commit description"
        placeholder="Description"
        rows={3}
        value={view.commitDescription}
        onChange={(e) => setView({ commitDescription: e.target.value })}
        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-2">
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title="Replace the last commit"
        >
          <input
            type="checkbox"
            checked={view.amend}
            disabled={!hasCommits}
            onChange={(e) => void toggleAmend(e.target.checked)}
          />
          Amend
        </label>
        <Button
          size="sm"
          className="ml-auto min-w-0"
          disabled={!canCommit}
          onClick={() => void commit()}
          title={`${label} (${modKey}+Enter)`}
        >
          <span className="truncate">{label}</span>
        </Button>
      </div>
    </div>
  )
}
