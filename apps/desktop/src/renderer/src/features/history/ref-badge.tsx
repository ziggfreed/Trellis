/** A small label for a branch or tag, shown next to commits in the history. */
import { Cloud, GitBranch, Tag } from 'lucide-react'
import type { Ref } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { draggableRef } from '@/features/drag-drop/drop-menu'

export function RefBadge({ gitRef }: { gitRef: Ref }) {
  const Icon = gitRef.type === 'tag' ? Tag : gitRef.type === 'remote-branch' ? Cloud : GitBranch
  return (
    <span
      title={
        gitRef.type === 'tag'
          ? gitRef.fullName
          : `${gitRef.fullName}\nDrag onto another branch or commit to merge, rebase or move it`
      }
      data-ref={gitRef.fullName}
      {...draggableRef(gitRef)}
      className={cn(
        'inline-flex max-w-48 shrink-0 items-center gap-1 rounded border px-1.5 text-xs leading-5',
        gitRef.type !== 'tag' && 'cursor-grab',
        gitRef.isHead
          ? 'border-brand/40 bg-brand/15 font-semibold text-foreground'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{gitRef.name}</span>
    </span>
  )
}
