/**
 * The dialog that shows an AI answer as it streams in: "Explain this
 * commit" and "Ask AI" on a merge conflict. For a conflict, once the answer
 * is complete it also shows the suggested file with a button to use it.
 *
 * Open it with explainCommitWithAi() or resolveConflictWithAi(); mount
 * <AiDialog /> once (app.tsx).
 */
import { useState } from 'react'
import { create } from 'zustand'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { startAiTask } from './ai-client'
import type { AiTask } from '@shared/ipc'

interface AiDialogState {
  open: boolean
  kind: AiTask['kind']
  title: string
  description: string
  status: 'running' | 'done' | 'error'
  text: string
  error: string
  truncated: boolean
  /** For a conflict: the suggested file and how to save it. */
  resolution: { content: string; apply: () => Promise<void> } | null
  cancel: () => void
}

const useAiDialog = create<AiDialogState>(() => ({
  open: false,
  kind: 'test',
  title: '',
  description: '',
  status: 'done',
  text: '',
  error: '',
  truncated: false,
  resolution: null,
  cancel: () => {},
}))

/** Start a task and show its answer in the dialog. */
function showTask(
  task: AiTask,
  heading: { title: string; description: string },
  onDone?: (result: { resolved?: string | null }) => AiDialogState['resolution'],
) {
  useAiDialog.getState().cancel() // only one answer at a time
  const running = startAiTask(task, (piece) =>
    useAiDialog.setState((s) => ({ text: s.text + piece })),
  )
  useAiDialog.setState({
    ...heading,
    kind: task.kind,
    open: true,
    status: 'running',
    text: '',
    error: '',
    truncated: false,
    resolution: null,
    cancel: running.cancel,
  })
  running.result.then(
    (result) => {
      if (useAiDialog.getState().cancel !== running.cancel) return // replaced by a newer task
      useAiDialog.setState({
        status: 'done',
        text: result.text,
        truncated: result.truncated,
        resolution: onDone?.(result) ?? null,
      })
    },
    (error: unknown) => {
      if (useAiDialog.getState().cancel !== running.cancel) return
      useAiDialog.setState({ status: 'error', error: errorMessage(error) })
    },
  )
}

export function explainCommitWithAi(repo: string, sha: string, subject: string) {
  showTask(
    { kind: 'explainCommit', repo, sha },
    { title: 'Explain commit', description: `${sha.slice(0, 7)} ${subject}` },
  )
}

export function resolveConflictWithAi(repo: string, path: string) {
  showTask(
    { kind: 'resolveConflict', repo, path },
    { title: 'Help with conflict', description: path },
    ({ resolved }) =>
      resolved
        ? {
            content: resolved,
            apply: async () => {
              await runAction(
                repo,
                () => api.invoke('repo:saveResolvedFile', repo, path, resolved),
                {
                  success: `Resolved ${path}. Check it, then continue.`,
                },
              )
            },
          }
        : null,
  )
}

export function AiDialog() {
  const state = useAiDialog()
  const [applying, setApplying] = useState(false)
  const close = () => {
    if (state.status === 'running') state.cancel()
    useAiDialog.setState({ open: false })
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-testid="ai-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            {state.title}
          </DialogTitle>
          <DialogDescription className="truncate">{state.description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-24 flex-1 overflow-y-auto text-sm" aria-live="polite">
          {state.status === 'error' ? (
            <p className="text-destructive" role="alert">
              {state.error}
            </p>
          ) : (
            <>
              {state.text ? (
                <p className="whitespace-pre-wrap" data-testid="ai-answer">
                  {state.text}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Thinking…
                </p>
              )}
              {state.truncated && (
                <p className="mt-3 text-xs text-muted-foreground">
                  This change was too large to send in full, so the answer is based on the first
                  part only.
                </p>
              )}
              {state.resolution && (
                <div className="mt-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Suggested file</p>
                  <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
                    {state.resolution.content}
                  </pre>
                </div>
              )}
              {state.status === 'done' && state.kind === 'resolveConflict' && !state.resolution && (
                <p className="mt-3 text-xs text-muted-foreground">
                  The answer didn’t include a complete resolved file, so there is nothing to apply.
                </p>
              )}
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          AI can be wrong. Check its answer before relying on it.
        </p>
        <DialogFooter>
          {state.status === 'running' && (
            <Button variant="outline" onClick={() => state.cancel()}>
              Stop
            </Button>
          )}
          {state.resolution && (
            <Button
              disabled={applying}
              onClick={async () => {
                setApplying(true)
                try {
                  await state.resolution?.apply()
                  useAiDialog.setState({ open: false })
                } finally {
                  setApplying(false)
                }
              }}
            >
              Use this resolution
            </Button>
          )}
          <Button variant={state.resolution ? 'outline' : 'default'} onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
