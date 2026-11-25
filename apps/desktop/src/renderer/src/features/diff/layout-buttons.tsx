/**
 * The Unified / Side-by-side buttons in diff headers. The choice is one
 * setting (`diffLayout`), shared by the history's diff and the Changes view.
 */
import { Columns2, Rows2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsStore } from '@/features/settings/settings-store'

export function DiffLayoutButtons() {
  const layout = useSettingsStore((s) => s.settings.diffLayout)
  const update = useSettingsStore((s) => s.update)
  return (
    <>
      <LayoutButton
        label="Unified view"
        active={layout === 'unified'}
        onClick={() => update({ diffLayout: 'unified' })}
      >
        <Rows2 />
      </LayoutButton>
      <LayoutButton
        label="Side-by-side view"
        active={layout === 'split'}
        onClick={() => update({ diffLayout: 'split' })}
      >
        <Columns2 />
      </LayoutButton>
    </>
  )
}

function LayoutButton(props: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={props.label}
          aria-pressed={props.active}
          onClick={props.onClick}
          className={props.active ? 'bg-accent text-foreground' : 'text-muted-foreground'}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}
