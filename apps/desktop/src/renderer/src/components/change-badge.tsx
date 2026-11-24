/** A small coloured letter showing how a file changed: A, M, D, R, C, T, U or ?. */
import type { ChangeKind } from '@shared/ipc'
import { cn } from '@/lib/utils'

const LETTERS: Record<ChangeKind, { letter: string; label: string; className: string }> = {
  added: { letter: 'A', label: 'Added', className: 'text-change-added' },
  untracked: { letter: '?', label: 'Untracked', className: 'text-change-added' },
  modified: { letter: 'M', label: 'Modified', className: 'text-change-modified' },
  'type-changed': { letter: 'T', label: 'Type changed', className: 'text-change-modified' },
  deleted: { letter: 'D', label: 'Deleted', className: 'text-change-deleted' },
  renamed: { letter: 'R', label: 'Renamed', className: 'text-change-renamed' },
  copied: { letter: 'C', label: 'Copied', className: 'text-change-renamed' },
  conflicted: { letter: 'U', label: 'Conflict', className: 'text-change-conflicted' },
}

export function ChangeBadge({ change, className }: { change: ChangeKind; className?: string }) {
  const { letter, label, className: color } = LETTERS[change]
  return (
    <span
      title={label}
      aria-label={label}
      className={cn('w-3 shrink-0 text-center font-mono text-xs font-bold', color, className)}
    >
      {letter}
    </span>
  )
}
