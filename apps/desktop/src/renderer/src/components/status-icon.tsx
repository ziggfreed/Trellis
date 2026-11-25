/**
 * The small status icons plugins can put on panel items and commits
 * (e.g. a CI result): success, failure, pending, neutral, info, warning.
 */
import { CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleX, Info } from 'lucide-react'
import type { StatusIcon as StatusIconName } from '@shared/ipc'
import { cn } from '@/lib/utils'

const ICONS = {
  success: { Icon: CircleCheck, className: 'text-change-added', label: 'Succeeded' },
  failure: { Icon: CircleX, className: 'text-destructive', label: 'Failed' },
  pending: { Icon: CircleDashed, className: 'text-change-modified', label: 'In progress' },
  neutral: { Icon: CircleDot, className: 'text-muted-foreground', label: 'Neutral' },
  info: { Icon: Info, className: 'text-brand', label: 'Information' },
  warning: { Icon: CircleAlert, className: 'text-change-modified', label: 'Warning' },
} satisfies Record<StatusIconName, unknown>

export function StatusIcon({ name, className }: { name: StatusIconName; className?: string }) {
  // Plugins send the name at run time, so fall back for unknown values.
  const { Icon, className: colour, label } = ICONS[name] ?? ICONS.neutral
  return <Icon className={cn('size-3.5 shrink-0', colour, className)} aria-label={label} />
}
