/**
 * The Changes view's other ways to look at a file, next to the hunk view:
 * "Edit" (change the file right here), "Rendered" (Markdown) and "Data"
 * (JSON). They compare the file on disk with what git has (the staged
 * version, or the last commit), or for staged changes, the staged version
 * with the last commit.
 */
import { lazy, Suspense, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { useFileDiff } from '@/features/repos/use-repo-data'
import { JsonDiffView, MarkdownDiffView } from '@/features/diff/special-views'
import { ImageDiffView } from '@/features/diff/image-diff'
import type { DiffMode } from '@/features/diff/view-switch'

// Part of the CodeMirror chunk, loaded on first use (see diff-panel.tsx).
const DiffEditor = lazy(() =>
  import('@/features/diff/diff-editor').then((m) => ({ default: m.DiffEditor })),
)

export function FileAlternateView(props: {
  repoPath: string
  file: string
  area: 'staged' | 'unstaged'
  mode: Exclude<DiffMode, 'diff'>
  /** Unsaved edits exist (so switching away can ask first). */
  onDirtyChange: (dirty: boolean) => void
}) {
  const { data, error } = useFileDiff(props.repoPath, { kind: props.area, path: props.file })
  if (props.mode === 'image') {
    return (
      <ImageDiffView repoPath={props.repoPath} target={{ kind: props.area, path: props.file }} />
    )
  }
  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null
  if (data.old.kind !== 'text' && data.old.kind !== 'missing') return <Binary />
  if (data.new.kind !== 'text') return <Binary />
  const oldText = data.old.kind === 'text' ? data.old.text : ''
  const newText = data.new.text

  if (props.mode === 'rendered') return <MarkdownDiffView oldText={oldText} newText={newText} />
  if (props.mode === 'structure') return <JsonDiffView oldText={oldText} newText={newText} />
  return (
    <EditFile
      repoPath={props.repoPath}
      file={props.file}
      original={oldText}
      initial={newText}
      onDirtyChange={props.onDirtyChange}
    />
  )
}

function Binary() {
  return (
    <p className="p-6 text-center text-sm text-muted-foreground">
      This view isn’t available for binary or very large files.
    </p>
  )
}

function EditFile(props: {
  repoPath: string
  file: string
  original: string
  initial: string
  onDirtyChange: (dirty: boolean) => void
}) {
  // The text as last saved (or loaded), to tell whether there are unsaved edits.
  const [saved, setSaved] = useState(props.initial)
  const [text, setText] = useState(props.initial)
  const dirty = text !== saved

  const change = (next: string) => {
    setText(next)
    props.onDirtyChange(next !== saved)
  }
  const save = async () => {
    const content = text
    const ok = await runAction(props.repoPath, async () => {
      await api.invoke('repo:writeWorkingFile', props.repoPath, props.file, content)
      return true
    })
    if (ok) {
      setSaved(content)
      props.onDirtyChange(false)
      toast.success(`Saved ${props.file}`)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-xs">
        <span className="text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'Edit the file; changes are shown against what git has.'}
        </span>
        <Button size="xs" className="ml-auto" disabled={!dirty} onClick={() => void save()}>
          <Save />
          Save
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <DiffEditor
            path={props.file}
            original={props.original}
            initial={props.initial}
            onChange={change}
            onSave={() => void save()}
          />
        </Suspense>
      </div>
    </div>
  )
}
