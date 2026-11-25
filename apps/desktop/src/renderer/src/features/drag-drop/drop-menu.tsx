/**
 * Dragging branches onto other branches or commits.
 *
 * - Branch labels in the history and branches in the sidebar can be dragged.
 * - Commit rows (and the labels on them) accept drops.
 * - Dropping opens a small menu at the mouse with the options from
 *   dropOptions(): merge, rebase, move the branch, or compare.
 *
 * Every action can be undone, so the menu choice itself is the confirmation.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import type { Ref } from '@shared/ipc'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { queryClient, repoKeys } from '@/lib/query-client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openCompare } from '@/features/repo-actions/actions'
import { dropOptions, type DropAction, type DropTarget } from './drop-options'

/** The drag data type for branches, so we ignore unrelated drags (files, text). */
export const REF_MIME = 'application/x-trellis-ref'

/** Props that make an element a draggable branch. */
export function draggableRef(ref: Ref) {
  if (ref.type === 'tag') return {}
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(REF_MIME, ref.fullName)
      event.dataTransfer.effectAllowed = 'move'
    },
  }
}

/** True if a drag carries a branch (only then should we accept the drop). */
export const isRefDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(REF_MIME)

interface DropMenuState {
  menu: { x: number; y: number; repo: string; actions: DropAction[] } | null
  close: () => void
}

const useDropMenuStore = create<DropMenuState>((set) => ({
  menu: null,
  close: () => set({ menu: null }),
}))

/** Handle a drop: work out the options and open the menu at the mouse. */
export async function handleRefDrop(repo: string, event: React.DragEvent, target: DropTarget) {
  const fullName = event.dataTransfer.getData(REF_MIME)
  const { clientX: x, clientY: y } = event
  const [refs, status] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: repoKeys.refs(repo),
      queryFn: () => api.invoke('repo:getRefs', repo),
    }),
    queryClient.fetchQuery({
      queryKey: repoKeys.status(repo),
      queryFn: () => api.invoke('repo:getStatus', repo),
    }),
  ])
  const source = refs.find((r) => r.fullName === fullName)
  if (!source) return
  const actions = dropOptions(source, target, status.branch.head)
  if (actions.length) useDropMenuStore.setState({ menu: { x, y, repo, actions } })
}

async function run(repo: string, action: DropAction) {
  switch (action.kind) {
    case 'merge': {
      const result = await runAction(repo, () =>
        api.invoke('repo:merge', repo, action.ref, { noFastForward: false }),
      )
      if (result?.status === 'done') toast.success(action.label)
      return
    }
    case 'rebase': {
      const result = await runAction(repo, () => api.invoke('repo:rebase', repo, action.onto))
      if (result?.status === 'done') toast.success(action.label)
      return
    }
    case 'move':
      await runAction(
        repo,
        () => api.invoke('repo:moveBranch', repo, action.branch, action.target),
        {
          success: action.label,
        },
      )
      return
    case 'compare':
      await openCompare(repo, action.head, action.base)
  }
}

/** The menu shown after a drop. Mount once. */
export function DropMenu() {
  const menu = useDropMenuStore((s) => s.menu)
  const close = useDropMenuStore((s) => s.close)
  return (
    <DropdownMenu open={menu !== null} onOpenChange={(open) => !open && close()}>
      {/* An invisible 1px trigger placed where the drop happened, to anchor the menu. */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-px"
          style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Drop branch
        </DropdownMenuLabel>
        {menu?.actions.map((action) => (
          <DropdownMenuItem key={action.label} onSelect={() => void run(menu.repo, action)}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
