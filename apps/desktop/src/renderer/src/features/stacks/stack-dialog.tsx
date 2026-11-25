/**
 * Stacked branches (see packages/git/src/stacks.ts): branches built on top
 * of each other, like main ← feature-api ← feature-ui.
 *
 * The dialog shows the stack under a branch (the branches between it and
 * the base, usually main) and offers:
 * - Rebase the whole stack onto the base, in one go (`git rebase
 *   --update-refs`); one undo puts every branch back.
 * - Push the whole stack, with force-with-lease (rebasing rewrote the
 *   commits, so a plain push would be refused).
 *
 * Open with openStack(repo, branch?) (command palette, or a branch's menu).
 */
import { useState } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
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
import { confirmDialog } from '@/features/dialogs/dialog-store'
import { trackOperation } from '@/features/repo-actions/operations-store'
import { useRefs, useRemotes, useStatus } from '@/features/repos/use-repo-data'
import { localBranches } from '@/features/sidebar/group-refs'

const useStackDialog = create<{ repo: string | null; top: string | null }>(() => ({
  repo: null,
  top: null,
}))

/** Show the stack under `top` (default: the current branch). */
export const openStack = (repo: string, top?: string) =>
  useStackDialog.setState({ repo, top: top ?? null })
const close = () => useStackDialog.setState({ repo: null })

export function StackDialog() {
  const repo = useStackDialog((s) => s.repo)
  return (
    <Dialog open={repo !== null} onOpenChange={(open) => !open && close()}>
      {repo && <StackContent repo={repo} />}
    </Dialog>
  )
}

function StackContent({ repo }: { repo: string }) {
  const requestedTop = useStackDialog((s) => s.top)
  const current = useStatus(repo).data?.branch.head ?? null
  const branches = localBranches(useRefs(repo).data ?? [])
  const remotes = useRemotes(repo).data ?? []
  const defaultBranch = useQuery({
    queryKey: ['repo', repo, 'default-branch'],
    queryFn: () => api.invoke('repo:getDefaultBranch', repo),
  })
  const top = requestedTop ?? current
  const [pickedBase, setBase] = useState<string | null>(null)
  const base = pickedBase ?? defaultBranch.data ?? null

  const stack = useQuery({
    queryKey: ['repo', repo, 'stack', top, base],
    queryFn: () => api.invoke('repo:getStack', repo, top!, base!),
    enabled: top !== null && base !== null && top !== base,
  })
  const entries = stack.data ?? []
  const topBranch = branches.find((b) => b.name === top)
  // Push to the top branch's remote, or "origin".
  const remote =
    topBranch?.upstream?.split('/')[0] ?? remotes.find((r) => r.name === 'origin')?.name ?? null

  const rebase = async () => {
    if (!top || !base) return
    close()
    if (top !== current) {
      // --update-refs rebases the checked-out branch, so switch to the top first.
      const switched = await runAction(repo, async () => {
        await api.invoke('repo:checkout', repo, { kind: 'branch', name: top })
        return true
      })
      if (!switched) return
    }
    const result = await runAction(repo, () => api.invoke('repo:rebaseStack', repo, base))
    if (result?.status === 'done') {
      toast.success(
        `Rebased ${entries.length} ${entries.length === 1 ? 'branch' : 'branches'} onto ${base}`,
        {
          description: 'Undo (Ctrl/Cmd+Z) puts them all back.',
        },
      )
    }
  }

  const push = async () => {
    if (!remote) return
    const names = entries.map((e) => e.name)
    const ok = await confirmDialog({
      title: `Push ${names.length} ${names.length === 1 ? 'branch' : 'branches'} to ${remote}?`,
      description: `${names.join(', ')}. Uses force with lease: each remote branch is replaced only if nobody else has pushed to it since your last fetch.`,
      confirmLabel: 'Push stack',
    })
    if (!ok) return
    close()
    await runAction(
      repo,
      () =>
        trackOperation(repo, 'Pushing stack', (id) =>
          api.invoke('repo:pushStack', id, repo, remote, names),
        ),
      { success: `Pushed ${names.length} ${names.length === 1 ? 'branch' : 'branches'}` },
    )
  }

  return (
    <DialogContent className="sm:max-w-lg" data-testid="stack-dialog">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers className="size-4" />
          Branch stack
        </DialogTitle>
        <DialogDescription>
          Branches built on top of each other. Rebasing the stack moves them all onto the base in
          one go, keeping each one’s commits.
        </DialogDescription>
      </DialogHeader>
      <label className="flex items-center gap-2 text-sm">
        Base
        <select
          value={base ?? ''}
          onChange={(e) => setBase(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-md border p-2 text-sm">
        {!top ? (
          <p className="text-muted-foreground">Check out a branch first.</p>
        ) : top === base ? (
          <p className="text-muted-foreground">Choose a base other than {top}.</p>
        ) : stack.error ? (
          <p className="text-destructive">{errorMessage(stack.error)}</p>
        ) : !stack.data ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">
            {top} has no commits that aren’t on {base}.
          </p>
        ) : (
          // Drawn like a stack: the top branch first, the base at the bottom.
          <ol className="space-y-1" aria-label="Stack, top first">
            {[...entries].reverse().map((entry) => (
              <li key={entry.name} className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-brand" />
                <span className="font-medium">{entry.name}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.commits} {entry.commits === 1 ? 'commit' : 'commits'}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full border border-muted-foreground" />
              {base} (base)
            </li>
          </ol>
        )}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          disabled={!remote || entries.length === 0}
          onClick={() => void push()}
        >
          Push stack
        </Button>
        <Button disabled={entries.length === 0} onClick={() => void rebase()}>
          Rebase stack onto {base}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
