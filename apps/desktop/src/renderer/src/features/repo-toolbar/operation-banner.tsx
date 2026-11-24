/**
 * A banner shown while a merge, rebase, cherry-pick or revert is in
 * progress (usually because it stopped for conflicts), explaining what to do
 * and offering Continue / Skip / Abort.
 */
import { TriangleAlert } from 'lucide-react'
import type { RepoOperation } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/features/repos/use-repo-data'
import * as actions from '@/features/repo-actions/actions'

const NAMES: Record<RepoOperation, string> = {
  merge: 'Merge',
  rebase: 'Rebase',
  'cherry-pick': 'Cherry-pick',
  revert: 'Revert',
}

export function OperationBanner({ repoPath }: { repoPath: string }) {
  const status = useStatus(repoPath).data
  const operation = status?.operation
  if (!operation) return null

  const conflicts = status.files.filter((f) => f.unstaged === 'conflicted').length
  const canSkip = operation === 'rebase' || operation === 'cherry-pick'

  return (
    <div
      role="status"
      data-testid="operation-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-change-modified/15 px-3 py-2 text-sm"
    >
      <TriangleAlert className="size-4 shrink-0 text-change-modified" />
      <span className="font-medium">{NAMES[operation]} in progress.</span>
      <span className="text-muted-foreground">
        {conflicts > 0
          ? `${conflicts} ${conflicts === 1 ? 'file has' : 'files have'} conflicts. Resolve them in the Changes view, stage them, then continue.`
          : 'All conflicts are resolved. Continue to finish.'}
      </span>
      <div className="ml-auto flex gap-1">
        {conflicts > 0 && (
          <Button size="xs" variant="outline" onClick={() => actions.showChanges(repoPath)}>
            Show conflicts
          </Button>
        )}
        <Button size="xs" variant="outline" onClick={() => void actions.abortOperation(repoPath)}>
          Abort
        </Button>
        {canSkip && (
          <Button size="xs" variant="outline" onClick={() => void actions.skipCommit(repoPath)}>
            Skip commit
          </Button>
        )}
        <Button
          size="xs"
          disabled={conflicts > 0}
          onClick={() => void actions.continueOperation(repoPath)}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
