/**
 * The diff area: a header with the file name and layout switch, and the
 * diff itself (or a message for binary, too-large or unchanged files).
 */
import { lazy, Suspense, useState } from 'react'
import { parseLfsPointer } from '@trellis/git/lfs-pointer'
import type { DiffTarget, FileContent } from '@shared/ipc'
import { FilePath } from '@/components/file-path'
import { formatBytes } from '@/lib/format'
import { useSettingsStore } from '@/features/settings/settings-store'
import { useFileDiff } from '@/features/repos/use-repo-data'
import { cn } from '@/lib/utils'
import { specialViews } from './structured-diff'
import { JsonDiffView, LfsPointerView, MarkdownDiffView } from './special-views'
import { ViewSwitch, type DiffMode } from './view-switch'
import { ImageDiffView, isImagePath } from './image-diff'
import { DiffLayoutButtons } from './layout-buttons'

// The diff editor (CodeMirror) is a large chunk of code that isn't needed
// until a diff is shown, so it loads on first use instead of at start-up.
const DiffViewer = lazy(() => import('./diff-viewer').then((m) => ({ default: m.DiffViewer })))

/** Explain why a file version can't be shown as text, or null if it can. */
function describeNonText(content: FileContent): string | null {
  if (content.kind === 'binary') return `Binary file (${formatBytes(content.size)})`
  if (content.kind === 'too-large') return `File too large to show (${formatBytes(content.size)})`
  return null
}

const textOf = (content: FileContent) => (content.kind === 'text' ? content.text : '')

export function DiffPanel({ repoPath, target }: { repoPath: string; target: DiffTarget | null }) {
  const layout = useSettingsStore((s) => s.settings.diffLayout)
  const { data, error, isPending } = useFileDiff(repoPath, target)
  const [chosenMode, setMode] = useState<DiffMode>('diff')
  const modes: DiffMode[] = target ? ['diff', ...specialViews(target.path)] : ['diff']
  const mode = modes.includes(chosenMode) ? chosenMode : 'diff'

  if (!target) {
    return <Message>Select a file to see its changes.</Message>
  }

  let body: React.ReactNode
  if (isImagePath(target.path) && mode === 'diff' && !target.path.toLowerCase().endsWith('.svg')) {
    // Images are compared visually (SVG, being text, keeps the line diff too).
    body = <ImageDiffView repoPath={repoPath} target={target} />
  } else if (mode === 'image') body = <ImageDiffView repoPath={repoPath} target={target} />
  else if (error) body = <Message className="text-destructive">{error.message}</Message>
  else if (isPending) body = null
  else {
    const reason = describeNonText(data.new) ?? describeNonText(data.old)
    const oldText = textOf(data.old)
    const newText = textOf(data.new)
    const oldPointer = parseLfsPointer(oldText)
    const newPointer = parseLfsPointer(newText)
    if (reason) body = <Message>{reason}</Message>
    else if (oldText === newText) body = <Message>No changes to the file's contents.</Message>
    else if ((oldPointer || !oldText) && (newPointer || !newText) && (oldPointer || newPointer))
      body = <LfsPointerView before={oldPointer} after={newPointer} />
    else if (mode === 'rendered') body = <MarkdownDiffView oldText={oldText} newText={newText} />
    else if (mode === 'structure') body = <JsonDiffView oldText={oldText} newText={newText} />
    else
      body = (
        <Suspense fallback={null}>
          <DiffViewer oldText={oldText} newText={newText} path={target.path} layout={layout} />
        </Suspense>
      )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <FilePath path={target.path} oldPath={'oldPath' in target ? target.oldPath : undefined} />
        <div className="ml-auto flex items-center gap-2">
          <ViewSwitch modes={modes} mode={mode} onChange={setMode} />
          {mode === 'diff' && <DiffLayoutButtons />}
        </div>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
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
