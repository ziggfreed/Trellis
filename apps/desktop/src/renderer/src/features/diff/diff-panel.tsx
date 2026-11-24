/**
 * The diff area: a header with the file name and layout switch, and the
 * diff itself (or a message for binary, too-large or unchanged files).
 */
import { Columns2, Rows2 } from 'lucide-react'
import type { DiffTarget, FileContent } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FilePath } from '@/components/file-path'
import { formatBytes } from '@/lib/format'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useFileDiff } from '@/features/repos/use-repo-data'
import { DiffViewer } from './diff-viewer'
import { cn } from '@/lib/utils'

/** Explain why a file version can't be shown as text, or null if it can. */
function describeNonText(content: FileContent): string | null {
  if (content.kind === 'binary') return `Binary file (${formatBytes(content.size)})`
  if (content.kind === 'too-large') return `File too large to show (${formatBytes(content.size)})`
  return null
}

const textOf = (content: FileContent) => (content.kind === 'text' ? content.text : '')

export function DiffPanel({ repoPath, target }: { repoPath: string; target: DiffTarget | null }) {
  const layout = useSettingsStore((s) => s.settings.diffLayout)
  const update = useSettingsStore((s) => s.update)
  const { data, error, isPending } = useFileDiff(repoPath, target)

  if (!target) {
    return <Message>Select a file to see its changes.</Message>
  }

  let body: React.ReactNode
  if (error) body = <Message className="text-destructive">{error.message}</Message>
  else if (isPending) body = null
  else {
    const reason = describeNonText(data.new) ?? describeNonText(data.old)
    const oldText = textOf(data.old)
    const newText = textOf(data.new)
    if (reason) body = <Message>{reason}</Message>
    else if (oldText === newText) body = <Message>No changes to the file's contents.</Message>
    else
      body = <DiffViewer oldText={oldText} newText={newText} path={target.path} layout={layout} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <FilePath path={target.path} oldPath={'oldPath' in target ? target.oldPath : undefined} />
        <div className="ml-auto flex items-center">
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
        </div>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
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

function Message({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center p-6 text-sm text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}
