/**
 * The commit message box under the changes list.
 *
 * - Summary (first line) and an optional description.
 * - "Amend" replaces the last commit; ticking it fills in that commit's message.
 * - "Push" pushes straight after committing. It's remembered between runs.
 * - Ctrl/Cmd+Enter commits.
 * - With AI turned on (Settings > AI), "Suggest" writes a message from the
 *   staged changes, streaming it into the boxes.
 * The draft is kept per repository while you switch tabs.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { shortSha } from '@/lib/format'
import { runAction } from '@/lib/run-action'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/features/repos/use-repo-data'
import { useSettingsStore } from '@/features/settings/settings-store'
import { pushAfterCommit } from '@/features/repo-actions/actions'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { modKey } from '@/hooks/use-keyboard-shortcuts'
import { startAiTask, useAiEnabled, type RunningAiTask } from '@/features/ai/ai-client'
import { isComplete, openIdentityDialog, useGitIdentity } from '@/features/onboarding/git-identity'
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
  const aiEnabled = useAiEnabled()
  const identity = useGitIdentity(repoPath)
  const [suggestion, setSuggestion] = useState<RunningAiTask | null>(null)
  const pushToo = useSettingsStore((s) => s.settings.pushAfterCommit)
  const updateSettings = useSettingsStore((s) => s.update)

  /** Ask the AI for a message, showing it in the boxes as it arrives. */
  const suggest = async () => {
    let text = ''
    const show = (message: string) => {
      const { summary, description } = splitCommitMessage(message)
      setView({ commitSummary: summary, commitDescription: description })
    }
    const task = startAiTask({ kind: 'commitMessage', repo: repoPath }, (piece) => {
      text += piece
      show(text)
    })
    setSuggestion(task)
    try {
      const result = await task.result
      show(result.text) // cleaned up (fences, quotes) by main
      if (result.truncated) {
        toast.info('The staged changes were too large to send in full.', {
          description: 'The message is based on the first part only; check it.',
        })
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSuggestion(null)
    }
  }

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
      const amended = view.amend
      toast.success(`${amended ? 'Amended' : 'Committed'} ${shortSha(sha)}`)
      setView({ commitSummary: '', commitDescription: '', amend: false })
      if (pushToo) await pushAfterCommit(repoPath, amended)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void commit()
    }
  }

  const label = view.amend
    ? pushToo
      ? 'Amend last commit and push'
      : 'Amend last commit'
    : stagedCount === 0
      ? 'Stage files to commit'
      : `Commit ${stagedCount} ${stagedCount === 1 ? 'file' : 'files'} to ${branch}${pushToo ? ' and push' : ''}`

  return (
    <div className="space-y-2 border-t p-3" onKeyDown={onKeyDown}>
      {identity.data && !isComplete(identity.data) && (
        <p className="text-xs text-change-modified" role="alert">
          Git doesn&apos;t know your name and email yet, so committing will fail.{' '}
          <button type="button" className="underline" onClick={openIdentityDialog}>
            Set them up
          </button>
        </p>
      )}
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
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title="Push to the remote straight after committing"
        >
          <input
            type="checkbox"
            checked={pushToo}
            onChange={(e) => updateSettings({ pushAfterCommit: e.target.checked })}
          />
          Push
        </label>
        {aiEnabled && (
          <Button
            size="xs"
            variant="ghost"
            disabled={!suggestion && stagedCount === 0}
            onClick={() => (suggestion ? suggestion.cancel() : void suggest())}
            title={
              suggestion
                ? 'Stop writing the message'
                : 'Write a commit message from the staged changes with AI'
            }
          >
            <Sparkles className={cn(suggestion && 'animate-pulse')} />
            {suggestion ? 'Stop' : 'Suggest'}
          </Button>
        )}
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
