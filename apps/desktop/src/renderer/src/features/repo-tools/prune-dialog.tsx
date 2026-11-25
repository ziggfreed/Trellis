/**
 * "Clean up branches": pick a target branch (main by default) and Trellis
 * scans every local branch, then lists the ones that look finished:
 *   - merged into the target (ticked),
 *   - squash- or rebase-merged into it (ticked; git can't see these),
 *   - not merged, but their remote branch was deleted (unticked),
 *   - not merged and never pushed (unticked).
 * The ticked ones are deleted in one go, and a single Ctrl/Cmd+Z brings them
 * back. The grouping rules live in branch-cleanup.ts.
 *
 * Below those, remote branches merged into the target can be deleted from
 * the server too. They start unticked and Trellis asks first, because that
 * affects everyone using the remote and undo can't bring them back.
 *
 * Open with openPruneDialog(repo, target?) (command palette, the broom
 * button on the sidebar's Branches header, or a branch's right-click menu).
 * Long-lived branches (main, develop...) and checked-out ones are never offered.
 */
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CleanupBranch, RemoteCleanupBranch } from '@shared/ipc'
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
import { REMOTE_STATE_TEXT, branchRemoteState } from '@/features/sidebar/branch-remote-state'
import { byRemote, groupCleanup, namesToForce, suggestedNames } from './branch-cleanup'
import { confirmDialog } from '@/features/dialogs/dialog-store'
import { trackOperation } from '@/features/repo-actions/operations-store'
import { queryClient, repoKeys } from '@/lib/query-client'

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
  const refs = useRefs(repo).data
  const branches = localBranches(refs ?? [])
  const current = useStatus(repo).data?.branch.head ?? null
  const defaultBranch = useQuery({
    queryKey: ['repo', repo, 'default-branch'],
    queryFn: () => api.invoke('repo:getDefaultBranch', repo),
  })
  // The user's pick, else the requested branch, else the repository's main branch.
  const [picked, setTarget] = useState<string | null>(null)
  const target =
    picked ?? requested ?? (defaultBranch.isSuccess ? (defaultBranch.data ?? current) : null)

  const scan = useQuery({
    queryKey: ['repo', repo, 'branch-cleanup', target],
    queryFn: () => api.invoke('repo:getBranchCleanup', repo, target!),
    enabled: target !== null,
  })
  const remoteScan = useQuery({
    queryKey: ['repo', repo, 'remote-branch-cleanup', target],
    queryFn: () => api.invoke('repo:getRemoteBranchCleanup', repo, target!),
    enabled: target !== null,
  })
  const remoteCandidates = remoteScan.data ?? []
  // Remote branches start unticked: deleting them can't be undone.
  const [remoteTicked, setRemoteTicked] = useState(new Set<string>())
  const chosenRemote = remoteCandidates.filter((b) => remoteTicked.has(b.name))
  const toggleRemote = (name: string) =>
    setRemoteTicked((set) => {
      const next = new Set(set)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  const candidates = useMemo(() => scan.data ?? [], [scan.data])
  const { groups, inProgress } = useMemo(
    () => groupCleanup(candidates, refs ?? [], target ?? ''),
    [candidates, refs, target],
  )
  // Ticks the user changed from the suggestion (merged ones start ticked).
  const [flipped, setFlipped] = useState(new Set<string>())
  const suggested = suggestedNames(groups)
  const isTicked = (name: string) => suggested.has(name) !== flipped.has(name)
  const chosen = candidates.map((b) => b.name).filter(isTicked)
  const risky = chosen.filter((name) => {
    const b = candidates.find((c) => c.name === name)
    return b?.merged === 'unmerged'
  })
  const toggle = (name: string) =>
    setFlipped((set) => {
      const next = new Set(set)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const remove = async () => {
    if (chosenRemote.length > 0) {
      const ok = await confirmDialog({
        title: `Delete ${chosenRemote.length} ${chosenRemote.length === 1 ? 'branch' : 'branches'} on the remote?`,
        description: `${chosenRemote.map((b) => b.name).join(', ')} will be removed from the server for everyone. Undo can’t bring remote branches back.`,
        confirmLabel: 'Delete',
        destructive: true,
      })
      if (!ok) return
    }
    close()
    if (chosen.length > 0) await deleteLocal()
    for (const { remote, branches } of byRemote(chosenRemote)) {
      const label = `${branches.length} ${branches.length === 1 ? 'branch' : 'branches'} on ${remote}`
      await runAction(
        repo,
        () =>
          trackOperation(repo, `Deleting ${label}`, (id) =>
            api.invoke('repo:deleteRemoteBranches', id, repo, remote, branches),
          ),
        { success: `Deleted ${label}` },
      )
    }
    if (chosenRemote.length > 0) {
      await queryClient.invalidateQueries({ queryKey: repoKeys.all(repo) })
    }
  }

  const deleteLocal = async () => {
    const force = namesToForce(chosen, candidates)
    const result = await runAction(repo, () =>
      api.invoke('repo:deleteBranches', repo, chosen, { force }),
    )
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
        <DialogTitle>Clean up branches</DialogTitle>
        <DialogDescription>
          Finds local branches that are finished: merged into the target branch, or left behind
          after their remote branch was deleted. Remote branches aren’t touched.
        </DialogDescription>
      </DialogHeader>
      <label className="flex items-center gap-2 text-sm">
        Merged into
        <select
          value={target ?? ''}
          onChange={(e) => {
            setTarget(e.target.value)
            setFlipped(new Set())
            setRemoteTicked(new Set())
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
      <div className="min-h-24 flex-1 space-y-3 overflow-y-auto rounded-md border p-2">
        {scan.error ? (
          <p className="text-sm text-destructive">{errorMessage(scan.error)}</p>
        ) : !scan.data ? (
          <p className="text-sm text-muted-foreground">Checking every branch…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to clean up. (main, master, develop and checked-out branches are always kept.)
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.id} aria-label={group.title} data-group={group.id}>
              <h3 className="text-sm font-medium">{group.title}</h3>
              <p className="mb-1 text-xs text-muted-foreground">{group.description}</p>
              <ul className="space-y-1">
                {group.branches.map((branch) => (
                  <li key={branch.name}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isTicked(branch.name)}
                        onChange={() => toggle(branch.name)}
                      />
                      <span className="truncate">{branch.name}</span>
                      <BranchFacts branch={branch} refs={refs ?? []} target={target ?? ''} />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {scan.data && inProgress > 0 && (
          <p className="text-xs text-muted-foreground">
            {inProgress} other {inProgress === 1 ? 'branch is' : 'branches are'} still in progress
            (not merged, and on a remote), so {inProgress === 1 ? 'it isn’t' : 'they aren’t'}{' '}
            listed.
          </p>
        )}
        <RemoteSection
          target={target ?? ''}
          loading={!remoteScan.data && !remoteScan.error}
          error={remoteScan.error}
          branches={remoteCandidates}
          ticked={remoteTicked}
          onToggle={toggleRemote}
          onTickAll={(all) =>
            setRemoteTicked(all ? new Set(remoteCandidates.map((b) => b.name)) : new Set())
          }
        />
      </div>
      {risky.length > 0 && (
        <p className="text-xs text-destructive">
          {risky.length} ticked {risky.length === 1 ? 'branch has' : 'branches have'} changes that
          aren’t on {target}. Undo brings them back if you change your mind.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={chosen.length + chosenRemote.length === 0}
          onClick={() => void remove()}
        >
          {deleteLabel(chosen.length, chosenRemote.length)}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** "Delete 2 branches", or "Delete 2 local + 1 remote" when remote ones are ticked. */
function deleteLabel(local: number, remote: number) {
  if (remote === 0) return `Delete ${local} ${local === 1 ? 'branch' : 'branches'}`
  if (local === 0) return `Delete ${remote} remote ${remote === 1 ? 'branch' : 'branches'}`
  return `Delete ${local} local + ${remote} remote`
}

/** The "Remote branches merged into …" part of the list. */
function RemoteSection(props: {
  target: string
  loading: boolean
  error: unknown
  branches: RemoteCleanupBranch[]
  ticked: Set<string>
  onToggle: (name: string) => void
  onTickAll: (all: boolean) => void
}) {
  const allTicked = props.branches.length > 0 && props.ticked.size === props.branches.length
  return (
    <section aria-label="Remote branches" data-group="remote" className="border-t pt-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Remote branches merged into {props.target}</h3>
        {props.branches.length > 1 && (
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => props.onTickAll(!allTicked)}
          >
            {allTicked ? 'Untick all' : 'Tick all'}
          </button>
        )}
      </div>
      <p className="mb-1 text-xs text-muted-foreground">
        Deleted from the server for everyone, and undo can’t bring them back. Fetch first so this
        list is up to date.
      </p>
      {props.error ? (
        <p className="text-sm text-destructive">{errorMessage(props.error)}</p>
      ) : props.loading ? (
        <p className="text-sm text-muted-foreground">Checking remote branches…</p>
      ) : props.branches.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None</p>
      ) : (
        <ul className="space-y-1">
          {props.branches.map((branch) => (
            <li key={branch.name}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={props.ticked.has(branch.name)}
                  onChange={() => props.onToggle(branch.name)}
                />
                <span className="truncate">{branch.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {branch.merged === 'squashed' ? 'squash/rebase-merged' : 'merged'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Small grey notes after a branch name: unmerged commits and where it is on the remote. */
function BranchFacts({
  branch,
  refs,
  target,
}: {
  branch: CleanupBranch
  refs: Parameters<typeof branchRemoteState>[1]
  target: string
}) {
  const state = branchRemoteState(branch, refs)
  const facts: string[] = []
  if (branch.merged === 'unmerged' && branch.aheadOfTarget > 0) {
    facts.push(
      `${branch.aheadOfTarget} ${branch.aheadOfTarget === 1 ? 'commit' : 'commits'} not on ${target}`,
    )
  }
  if (state === 'tracking') facts.push(`on ${branch.upstream}`)
  else facts.push(REMOTE_STATE_TEXT[state].label)
  return <span className="ml-auto shrink-0 text-xs text-muted-foreground">{facts.join(' · ')}</span>
}
