/**
 * The interactive rebase editor.
 *
 * Commits are listed oldest first, which is the order git replays them.
 * For each commit choose an action (pick, reword, squash, fixup, drop) and
 * drag rows (or use the arrow buttons) to reorder. Squash and fixup rows are
 * indented to show they're combined into the commit above.
 *
 * Starting the rebase is recorded for undo, like every other operation.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { validateRebasePlan } from '@trellis/git/rebase-plan'
import type { RebaseAction } from '@shared/ipc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { shortSha } from '@/lib/format'
import { runAction } from '@/lib/run-action'
import { useRebaseStore, type RebaseRequest } from './rebase-store'
import {
  initialRows,
  isUnchanged,
  moveRow,
  resultCount,
  toPlan,
  type RebaseRow,
} from './rebase-list'

const ACTIONS: { value: RebaseAction; label: string; help: string }[] = [
  { value: 'pick', label: 'Pick', help: 'Keep the commit' },
  { value: 'reword', label: 'Reword', help: 'Keep it with a new message' },
  {
    value: 'squash',
    label: 'Squash',
    help: 'Combine into the commit above, keeping both messages',
  },
  { value: 'fixup', label: 'Fixup', help: 'Combine into the commit above, keeping its message' },
  { value: 'drop', label: 'Drop', help: 'Remove the commit' },
]

export function RebaseDialog() {
  const request = useRebaseStore((s) => s.request)
  const close = useRebaseStore((s) => s.close)
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close()}>
      {request && (
        <RebaseEditor key={`${request.repo}:${request.base}`} request={request} onClose={close} />
      )}
    </Dialog>
  )
}

function RebaseEditor({ request, onClose }: { request: RebaseRequest; onClose: () => void }) {
  const [rows, setRows] = useState(() => initialRows(request.commits))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  const problem = validateRebasePlan(toPlan(rows))
  const unchanged = isUnchanged(rows, request.commits)

  const update = (index: number, patch: Partial<RebaseRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const start = async () => {
    setRunning(true)
    const result = await runAction(request.repo, () =>
      api.invoke('repo:interactiveRebase', request.repo, request.base, toPlan(rows)),
    )
    setRunning(false)
    if (result?.status === 'done') toast.success('Rebase complete')
    if (result) onClose()
  }

  return (
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Interactive rebase</DialogTitle>
        <DialogDescription>
          Oldest commit first. Choose what to do with each commit and drag to reorder. You can undo
          the whole rebase afterwards.
        </DialogDescription>
      </DialogHeader>

      <ol className="min-h-0 flex-1 overflow-y-auto rounded-md border" data-testid="rebase-list">
        {rows.map((row, index) => {
          const combined = row.action === 'squash' || row.action === 'fixup'
          return (
            <li
              key={row.commit.sha}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) setRows((current) => moveRow(current, dragIndex, index))
                setDragIndex(null)
              }}
              onDragEnd={() => setDragIndex(null)}
              aria-label={row.commit.subject}
              className={cn(
                'flex items-start gap-2 border-b px-2 py-1.5 text-sm last:border-b-0',
                dragIndex === index && 'opacity-50',
                row.action === 'drop' && 'bg-muted/50',
              )}
            >
              <GripVertical
                className="mt-1.5 size-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden
              />
              <select
                aria-label={`Action for ${row.commit.subject}`}
                value={row.action}
                onChange={(e) => update(index, { action: e.target.value as RebaseAction })}
                title={ACTIONS.find((a) => a.value === row.action)?.help}
                className="h-7 w-24 shrink-0 rounded-md border border-input bg-background px-1 text-sm"
              >
                {ACTIONS.map((action) => (
                  <option key={action.value} value={action.value} title={action.help}>
                    {action.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 w-16 shrink-0 font-mono text-xs text-muted-foreground">
                {shortSha(row.commit.sha)}
              </span>
              <div className={cn('min-w-0 flex-1', combined && 'pl-6')}>
                {row.action === 'reword' ? (
                  <textarea
                    aria-label={`New message for ${row.commit.subject}`}
                    value={row.message}
                    rows={Math.min(4, row.message.split('\n').length + 1)}
                    onChange={(e) => update(index, { message: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                ) : (
                  <p
                    className={cn(
                      'mt-1 truncate',
                      row.action === 'drop' && 'text-muted-foreground line-through',
                    )}
                  >
                    {combined && <span className="text-muted-foreground">↳ </span>}
                    {row.commit.subject}
                  </p>
                )}
              </div>
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${row.commit.subject} up`}
                  disabled={index === 0}
                  onClick={() => setRows((current) => moveRow(current, index, index - 1))}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${row.commit.subject} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => setRows((current) => moveRow(current, index, index + 1))}
                >
                  <ArrowDown />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>

      <p
        className={cn('text-sm', problem ? 'text-destructive' : 'text-muted-foreground')}
        role="status"
      >
        {problem ?? `${rows.length} commits become ${resultCount(rows)}.`}
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={problem !== null || unchanged || running} onClick={() => void start()}>
          {running ? 'Rebasing…' : 'Start rebase'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
