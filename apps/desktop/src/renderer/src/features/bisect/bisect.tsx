/**
 * The bisect assistant: finding the commit that introduced a bug by marking
 * commits good or bad in the history (see packages/git/src/bisect.ts).
 *
 *   1. Right-click a commit with the bug > Bisect > "Start: this commit is bad".
 *   2. Right-click a commit without it > Bisect > "Mark good". Git checks out
 *      a commit halfway between.
 *   3. Test it, then click Good / Bad / Skip in the banner. Repeat until the
 *      banner names the first bad commit.
 *
 * - useBisect: the current state (null when not bisecting)
 * - BisectBanner: instructions and buttons above the history
 * - BisectMenuItems: the "Bisect" submenu in a commit's right-click menu
 * - bisectRole / BisectBadge: the marks drawn on commits in the graph
 */
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import type { BisectState } from '@shared/ipc'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { shortSha } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { useCommitDetails } from '@/features/repos/use-repo-data'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'

export function useBisect(repo: string) {
  return useQuery({
    queryKey: ['repo', repo, 'bisect'],
    queryFn: () => api.invoke('repo:getBisect', repo),
  })
}

export const startBisect = (repo: string, bad: string) =>
  runAction(repo, () => api.invoke('repo:bisectStart', repo, bad, null), {
    success: 'Bisect started. Now mark a commit where the bug didn’t happen as good.',
  })

export const markBisect = (repo: string, verdict: 'good' | 'bad' | 'skip', sha: string | null) =>
  runAction(repo, () => api.invoke('repo:bisectMark', repo, verdict, sha))

export const stopBisect = (repo: string) =>
  runAction(repo, () => api.invoke('repo:bisectReset', repo), {
    success: 'Stopped bisecting; back where you started.',
  })

/** How many test steps are probably left with `remaining` commits in question. */
export function stepsLeft(remaining: number): number {
  return remaining <= 1 ? 0 : Math.ceil(Math.log2(remaining))
}

export type BisectRole = 'bad' | 'good' | 'skipped' | 'current' | 'culprit'

/** What a commit is in the bisect (for the mark in the graph), if anything. */
export function bisectRole(state: BisectState | null | undefined, sha: string): BisectRole | null {
  if (!state) return null
  if (state.culprit === sha) return 'culprit'
  if (state.bad === sha) return 'bad'
  if (state.good.includes(sha)) return 'good'
  if (state.skipped.includes(sha)) return 'skipped'
  if (state.current === sha && state.bad && state.good.length) return 'current'
  return null
}

const BADGES: Record<BisectRole, { label: string; className: string; title: string }> = {
  bad: { label: 'bad', className: 'bg-destructive/15 text-destructive', title: 'Marked bad' },
  good: {
    label: 'good',
    className: 'bg-change-added/15 text-change-added',
    title: 'Marked good',
  },
  skipped: { label: 'skipped', className: 'bg-muted text-muted-foreground', title: 'Skipped' },
  current: {
    label: 'test this',
    className: 'bg-brand/15 text-brand',
    title: 'Checked out: test it',
  },
  culprit: {
    label: 'first bad',
    className: 'bg-destructive/15 font-bold text-destructive ring-1 ring-destructive',
    title: 'The first bad commit',
  },
}

export function BisectBadge({ role }: { role: BisectRole }) {
  const badge = BADGES[role]
  return (
    <span
      data-testid="bisect-badge"
      title={badge.title}
      className={cn('shrink-0 rounded px-1.5 text-[11px] font-medium', badge.className)}
    >
      {badge.label}
    </span>
  )
}

export function BisectBanner({ repoPath }: { repoPath: string }) {
  const state = useBisect(repoPath).data
  const subjectSha = state?.culprit ?? state?.current ?? null
  const subject = useCommitDetails(repoPath, state ? subjectSha : null).data?.commit.subject
  if (!state) return null

  const show = (sha: string) =>
    useRepoViewStore.getState().update(repoPath, {
      view: 'history',
      selectedSha: sha,
      seekSelected: true,
      selectedFile: null,
    })
  const describe = (sha: string) => `${shortSha(sha)}${subject ? ` “${subject}”` : ''}`

  let message: React.ReactNode
  let buttons: React.ReactNode = null
  if (state.culprit) {
    message = (
      <>
        <span className="font-medium">Found it:</span> {describe(state.culprit)} is the first bad
        commit.
      </>
    )
    buttons = (
      <Button size="xs" variant="outline" onClick={() => show(state.culprit!)}>
        Show commit
      </Button>
    )
  } else if (!state.bad || state.good.length === 0) {
    message = (
      <>
        <span className="font-medium">Bisecting.</span> Right-click a commit{' '}
        {state.bad
          ? 'where the bug didn’t happen and choose Bisect › Mark good'
          : 'with the bug and choose Bisect › Mark bad'}
        .
      </>
    )
  } else {
    const steps = stepsLeft(state.remaining ?? 0)
    message = (
      <>
        <span className="font-medium">Bisecting.</span> Test the checked-out commit
        {state.current ? ` ${describe(state.current)}` : ''}, then mark it.{' '}
        <span className="text-muted-foreground">
          About {steps} {steps === 1 ? 'step' : 'steps'} left ({state.remaining} commits in
          question).
        </span>
      </>
    )
    buttons = (
      <>
        <Button size="xs" variant="outline" onClick={() => void markBisect(repoPath, 'good', null)}>
          Good
        </Button>
        <Button size="xs" variant="outline" onClick={() => void markBisect(repoPath, 'bad', null)}>
          Bad
        </Button>
        <Button
          size="xs"
          variant="ghost"
          title="Can’t test this one (e.g. it doesn’t build)"
          onClick={() => void markBisect(repoPath, 'skip', null)}
        >
          Skip
        </Button>
      </>
    )
  }

  return (
    <div
      role="status"
      data-testid="bisect-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-brand/10 px-3 py-2 text-sm"
    >
      <Search className="size-4 shrink-0 text-brand" />
      <span className="min-w-0">{message}</span>
      <div className="ml-auto flex gap-1">
        {buttons}
        <Button size="xs" variant="ghost" onClick={() => void stopBisect(repoPath)}>
          Stop bisecting
        </Button>
      </div>
    </div>
  )
}

/** The "Bisect" submenu for a commit's right-click menu. */
export function BisectMenuItems({ repo, sha }: { repo: string; sha: string }) {
  const state = useBisect(repo).data
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Bisect</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-72">
        {!state ? (
          <ContextMenuItem onSelect={() => void startBisect(repo, sha)}>
            Start: this commit has the bug (bad)
          </ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem onSelect={() => void markBisect(repo, 'good', sha)}>
              Mark good (no bug here)
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void markBisect(repo, 'bad', sha)}>
              Mark bad (has the bug)
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void markBisect(repo, 'skip', sha)}>
              Skip (can’t test)
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void stopBisect(repo)}>Stop bisecting</ContextMenuItem>
          </>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
