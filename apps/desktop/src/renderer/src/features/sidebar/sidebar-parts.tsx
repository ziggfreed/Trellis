/**
 * Building blocks of the repository sidebar: a collapsible Section and an
 * Item row. Shared by the built-in sections (repo-sidebar.tsx) and plugin
 * panels (features/plugins/plugin-panels.tsx).
 */
import { useState } from 'react'
import { ChevronRight, Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Section(props: {
  title: string
  icon?: LucideIcon
  count: number
  nested?: boolean
  defaultOpen?: boolean
  /** A small button in the header ("+" unless another icon is given). */
  action?: { label: string; onClick: () => void; icon?: LucideIcon }
  /** Wraps the header button, e.g. in a right-click menu. */
  wrapHeader?: (header: React.ReactElement) => React.ReactNode
  /** Hover text for the header. */
  tooltip?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  const Icon = props.icon
  const ActionIcon = props.action?.icon ?? Plus
  const header = (
    <button
      title={props.tooltip}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cn(
        'flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-sidebar-accent',
        props.nested
          ? 'pl-5 text-sm'
          : 'text-xs font-medium tracking-wide text-muted-foreground uppercase',
      )}
    >
      <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{props.title}</span>
      <span className="ml-auto text-xs font-normal text-muted-foreground">{props.count}</span>
    </button>
  )
  return (
    <div className={cn('group/section relative', !props.nested && 'mb-2')}>
      {props.wrapHeader ? props.wrapHeader(header) : header}
      {props.action && (
        <button
          type="button"
          aria-label={props.action.label}
          title={props.action.label}
          onClick={props.action.onClick}
          className="absolute top-1 right-8 rounded p-0.5 text-muted-foreground opacity-0 group-hover/section:opacity-100 hover:text-foreground focus:opacity-100"
        >
          <ActionIcon className="size-3.5" />
        </button>
      )}
      {open && (
        <div>
          {props.count === 0 && !props.nested ? (
            <p className="px-8 py-0.5 text-xs text-muted-foreground italic">None</p>
          ) : (
            props.children
          )}
        </div>
      )}
    </div>
  )
}

export interface ItemProps extends React.ComponentProps<'button'> {
  label: string
  selected: boolean
  strong?: boolean
  indent?: boolean
  /** Shown before the label (e.g. a status icon). */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

/**
 * One row in the sidebar. Extra props (event handlers, ref) are passed to the
 * button, which lets context menus wrap it.
 */
export function Item({
  label,
  selected,
  strong,
  indent,
  leading,
  trailing,
  title,
  className,
  ...rest
}: ItemProps) {
  return (
    <button
      type="button"
      title={title ?? label}
      {...rest}
      className={cn(
        'flex w-full items-center gap-2 py-1 pr-2 text-left hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
        indent ? 'pl-12' : 'pl-8',
        selected && 'bg-sidebar-accent',
        className,
      )}
    >
      {strong && (
        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="Current branch" />
      )}
      {leading}
      <span className={cn('truncate', strong && 'font-semibold')}>{label}</span>
      {trailing}
    </button>
  )
}
