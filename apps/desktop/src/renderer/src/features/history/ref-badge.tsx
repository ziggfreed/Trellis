/** A small label for a branch or tag, shown next to commits in the history. */
import { Cloud, GitBranch, Tag } from 'lucide-react'
import type { Ref } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { draggableRef } from '@/features/drag-drop/drop-menu'

export function RefBadge({
  gitRef,
  onHoverChange,
  onDoubleClick,
  onClick,
  pinned = false,
}: {
  gitRef: Ref
  /** Called with true/false as the pointer enters/leaves (to highlight the branch). */
  onHoverChange?: (hovering: boolean) => void
  /** Double-click to check this ref out (the row's own double-click is skipped). */
  onDoubleClick?: () => void
  /** Click to pin (or unpin) the branch's highlight. */
  onClick?: () => void
  /** True while this branch's highlight is pinned. */
  pinned?: boolean
}) {
  const Icon = gitRef.type === 'tag' ? Tag : gitRef.type === 'remote-branch' ? Cloud : GitBranch
  return (
    <span
      title={
        gitRef.type === 'tag'
          ? `${gitRef.fullName}\nDouble-click to check out`
          : `${gitRef.fullName}\nClick to highlight its commits, double-click to check out. Drag onto another branch or commit to merge, rebase or move it`
      }
      data-ref={gitRef.fullName}
      data-pinned={pinned || undefined}
      onClick={onClick}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onDoubleClick={
        onDoubleClick &&
        ((event) => {
          event.stopPropagation()
          onDoubleClick()
        })
      }
      {...draggableRef(gitRef)}
      className={cn(
        'inline-flex max-w-48 shrink-0 items-center gap-1 rounded border px-1.5 text-xs leading-5',
        gitRef.type !== 'tag' && 'cursor-grab',
        gitRef.isHead
          ? 'border-brand/40 bg-brand/15 font-semibold text-foreground'
          : 'bg-muted text-muted-foreground',
        pinned && 'ring-2 ring-brand',
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{gitRef.name}</span>
    </span>
  )
}
