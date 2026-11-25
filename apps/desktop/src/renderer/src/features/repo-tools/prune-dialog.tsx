/**
 * "Delete merged branches": lists local branches whose commits are all on a
 * target branch (main by default), so deleting them loses nothing, and
 * deletes the ticked ones in one go. A single Ctrl/Cmd+Z brings them back.
 *
 * Open with openPruneDialog(repo, target?) (command palette, or a branch's
 * right-click menu). Long-lived branches (main, develop...) and checked-out
 * ones are never offered.
 */
import { useState } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
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
import { useRefs, useStatus } from '@/features/repos/use-repo-data'
import { localBranches } from '@/features/sidebar/group-refs'

const usePruneDialog = create<{ repo: string | null; target: string | null }>(() => ({
  repo: null,
  target: null,
}))

/** Open the dialog; `target` defaults to the repository's main branch. */
export const openPruneDialog = (repo: string, target?: string) =>
  usePruneDialog.setState({ repo, target: target ?? null })
const close = () => usePruneDialog.setState({ repo: null })

export function PruneDialog() {
  const repo = usePruneDialog((s) => s.repo)
  return (
    <Dialog open={repo !== null} onOpenChange={(open) => !open && close()}>
      {repo && <PruneContent repo={repo} />}
    </Dialog>
  )
}

function PruneContent({ repo }: { repo: string }) {
  const requested = usePruneDialog((s) => s.target)
  const branches = localBranches(useRefs(repo).data ?? [])
  const current = useStatus(repo).data?.branch.head ?? null
  const defaultBranch = useQuery({
    queryKey: ['repo', repo, 'default-branch'],
    queryFn: () => api.invoke('repo:getDefaultBranch', repo),
  })
  // The user's pick, else the requested branch, else the repository's main branch.
  const [picked, setTarget] = useState<string | null>(null)
  const target =
    picked ?? requested ?? (defaultBranch.isSuccess ? (defaultBranch.data ?? current) : null)

  const merged = useQuery({
    queryKey: ['repo', repo, 'merged-branches', target],
    queryFn: () => api.invoke('repo:getMergedBranches', repo, target!),
    enabled: target !== null,
  })
  // Everything starts ticked; the user unticks what to keep.
  const [unticked, setUnticked] = useState(new Set<string>())
  const names = merged.data ?? []
  const chosen = names.filter((name) => !unticked.has(name))
  const toggle = (name: string) =>
    setUnticked((set) => {
      const next = new Set(set)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const remove = async () => {
    close()
    const result = await runAction(repo, () => api.invoke('repo:deleteBranches', repo, chosen))
    if (!result) return
    if (result.deleted.length) {
      toast.success(
        `Deleted ${result.deleted.length} ${result.deleted.length === 1 ? 'branch' : 'branches'}`,
        { description: 'Undo (Ctrl/Cmd+Z) brings them back.' },
      )
    }
    for (const failure of result.failed) {
      toast.error(`Couldn’t delete ${failure.name}`, { description: failure.error })
    }
  }

  return (
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg" data-testid="prune-dialog">
      <DialogHeader>
        <DialogTitle>Delete merged branches</DialogTitle>
        <DialogDescription>
          These branches have no commits that aren’t already on the target branch, so deleting them
          loses nothing. Their remote branches aren’t touched.
        </DialogDescription>
      </DialogHeader>
      <label className="flex items-center gap-2 text-sm">
        Merged into
        <select
          value={target ?? ''}
          onChange={(e) => {
            setTarget(e.target.value)
            setUnticked(new Set())
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="min-h-24 flex-1 overflow-y-auto rounded-md border p-2">
        {merged.error ? (
          <p className="text-sm text-destructive">{errorMessage(merged.error)}</p>
        ) : !merged.data ? (
          <p className="text-sm text-muted-foreground">Looking for merged branches…</p>
        ) : names.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No merged branches to clean up. (main, master, develop and checked-out branches are
            always kept.)
          </p>
        ) : (
          <ul className="space-y-1">
            {names.map((name) => (
              <li key={name}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!unticked.has(name)}
                    onChange={() => toggle(name)}
                  />
                  <span className="truncate">{name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={chosen.length === 0} onClick={() => void remove()}>
          Delete {chosen.length} {chosen.length === 1 ? 'branch' : 'branches'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
