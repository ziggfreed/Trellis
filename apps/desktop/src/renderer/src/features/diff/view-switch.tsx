/**
 * The small "Diff | Rendered | Data | Edit" switch in a diff header. Which
 * buttons appear depends on the file (see specialViews in structured-diff.ts)
 * and on whether it can be edited (working-tree files only).
 */
import { cn } from '@/lib/utils'

export type DiffMode = 'diff' | 'rendered' | 'structure' | 'image' | 'edit'

const LABELS: Record<DiffMode, { label: string; title: string }> = {
  diff: { label: 'Diff', title: 'Line-by-line changes' },
  rendered: { label: 'Rendered', title: 'The document as it displays, with changed blocks marked' },
  structure: { label: 'Data', title: 'Changed values, ignoring formatting and key order' },
  image: { label: 'Image', title: 'Compare the pictures' },
  edit: { label: 'Edit', title: 'Edit the file here (Ctrl/Cmd+S saves)' },
}

export function ViewSwitch(props: {
  modes: DiffMode[]
  mode: DiffMode
  onChange: (mode: DiffMode) => void
  /** Label for the first ("diff") button, e.g. "Hunks" in the Changes view. */
  diffLabel?: string
}) {
  if (props.modes.length < 2) return null
  return (
    <div role="radiogroup" aria-label="View" className="flex rounded-md border p-0.5">
      {props.modes.map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={props.mode === mode}
          title={LABELS[mode].title}
          onClick={() => props.onChange(mode)}
          className={cn(
            'rounded px-2 py-0.5 text-xs',
            props.mode === mode
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode === 'diff' && props.diffLabel ? props.diffLabel : LABELS[mode].label}
        </button>
      ))}
    </div>
  )
}
