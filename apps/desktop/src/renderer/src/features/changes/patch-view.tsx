/**
 * Shows the changes to one working-tree file as hunks, and lets you stage,
 * unstage or discard individual hunks or lines.
 *
 * - Each hunk header has buttons for the whole hunk.
 * - Click changed lines to select them (Shift+click selects a range), then
 *   use the buttons in the toolbar for just those lines.
 *
 * Partial changes are applied by building a smaller patch in the UI
 * (buildPartialPatch from @trellis/git/patch) and applying it with git.
 *
 * The header's view switch also offers Edit (change a working-tree file in
 * place) and, for Markdown and JSON files, Rendered / Data views; those live
 * in file-alternate-view.tsx.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Minus, Plus, Undo2 } from 'lucide-react'
import {
  allLineIds,
  buildPartialPatch,
  hunkLineIds,
  lineId,
  type FilePatch,
} from '@trellis/git/patch'
import type { PatchLine } from '@shared/ipc'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { repoKeys } from '@/lib/query-client'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { FilePath } from '@/components/file-path'
import { confirmDialog } from '@/features/dialogs/dialog-store'
import { useStatus } from '@/features/repos/use-repo-data'
import { selectRange, toggleLine } from './line-selection'
import { ConflictEditor } from '@/features/conflicts/conflict-editor'
import { highlightLines, type Segment } from '@/features/diff/highlight-lines'
import { useLanguageParser } from '@/features/diff/load-language'
import { specialViews } from '@/features/diff/structured-diff'
import { ViewSwitch, type DiffMode } from '@/features/diff/view-switch'
import { FileAlternateView } from './file-alternate-view'
import { ImageDiffView, isImagePath } from '@/features/diff/image-diff'

/** Stop rendering lines after this many, to keep huge diffs responsive. */
const MAX_LINES = 5000

interface PatchViewProps {
  repoPath: string
  file: string
  /** 'staged' shows HEAD→index; 'unstaged' shows index→working tree. */
  area: 'staged' | 'unstaged'
}

export function PatchView({ repoPath, file, area }: PatchViewProps) {
  const status = useStatus(repoPath).data
  const entry = status?.files.find((f) => f.path === file)
  const untracked = area === 'unstaged' && entry?.unstaged === 'untracked'
  const conflicted = entry?.unstaged === 'conflicted'
  const patchArea = untracked ? 'untracked' : area
  // Only files on disk can be edited (not staged snapshots or deleted files).
  const editable = area === 'unstaged' && !conflicted && entry?.unstaged !== 'deleted'
  const modes: DiffMode[] = ['diff', ...specialViews(file), ...(editable ? ['edit' as const] : [])]
  const [chosenMode, setChosenMode] = useState<DiffMode>('diff')
  const mode = modes.includes(chosenMode) ? chosenMode : 'diff'
  const [dirty, setDirty] = useState(false)
  const changeMode = async (next: DiffMode) => {
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Discard your unsaved edits?',
        description: 'Switching views loses the edits you haven’t saved.',
        confirmLabel: 'Discard edits',
        destructive: true,
      })
      if (!ok) return
      setDirty(false)
    }
    setChosenMode(next)
  }

  const {
    data: patch,
    error,
    isPending,
  } = useQuery({
    queryKey: repoKeys.filePatch(repoPath, file, patchArea),
    queryFn: () => api.invoke('repo:getFilePatch', repoPath, file, patchArea),
    enabled: !conflicted,
  })

  // The selection belongs to one version of the patch; when the patch is
  // reloaded (after staging, or a file change) it starts empty again.
  const [selection, setSelection] = useState<{
    patch: FilePatch | null | undefined
    ids: Set<string>
    anchor: string | null
  }>({ patch: undefined, ids: new Set(), anchor: null })
  const selected = selection.patch === patch ? selection.ids : new Set<string>()
  const anchor = selection.patch === patch ? selection.anchor : null
  const ordered = useMemo(() => (patch ? allLineIds(patch) : []), [patch])

  // Syntax highlighting: highlight each hunk's old and new side separately
  // (each is valid-ish code on its own), then look lines up by position.
  const parser = useLanguageParser(file)
  const highlighted = useMemo(() => {
    if (!patch || !parser) return null
    return patch.hunks.map((hunk) => ({
      old: highlightLines(
        hunk.lines
          .filter((l) => l.kind !== 'add')
          .map((l) => l.text)
          .join('\n'),
        parser,
      ),
      new: highlightLines(
        hunk.lines
          .filter((l) => l.kind !== 'delete')
          .map((l) => l.text)
          .join('\n'),
        parser,
      ),
    }))
  }, [patch, parser])

  const header = (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm">
      <FilePath path={file} />
      <span className="text-xs text-muted-foreground">
        {area === 'staged' ? 'Staged' : untracked ? 'Untracked' : 'Unstaged'}
      </span>
      <div className="ml-auto">
        <ViewSwitch
          modes={modes}
          mode={mode}
          diffLabel="Hunks"
          onChange={(next) => void changeMode(next)}
        />
      </div>
    </div>
  )

  if (mode !== 'diff') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <FileAlternateView
            repoPath={repoPath}
            file={file}
            area={area}
            mode={mode}
            onDirtyChange={setDirty}
          />
        </div>
      </div>
    )
  }

  if (conflicted) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <ConflictEditor repoPath={repoPath} file={file} />
        </div>
      </div>
    )
  }

  let body: React.ReactNode = null
  if (error) body = <Message className="text-destructive">{error.message}</Message>
  else if (isPending) body = null
  else if (!patch) body = <Message>No changes.</Message>
  else if (patch.binary && isImagePath(file))
    body = <ImageDiffView repoPath={repoPath} target={{ kind: area, path: file }} />
  else if (patch.binary) body = <Message>Binary file. Stage or discard it from the list.</Message>
  else {
    // Line-level unstage/discard of a whole new or deleted file can't be
    // expressed as a patch git will apply, so only whole-file actions then.
    const reversePartialOk = !patch.isNew && !patch.isDeleted
    const apply = async (ids: Iterable<string>, action: 'stage' | 'unstage' | 'discard') => {
      const text = buildPartialPatch(patch, new Set(ids), action !== 'stage')
      if (!text) return
      if (action === 'discard') {
        const ok = await confirmDialog({
          title: 'Discard the selected changes?',
          description: 'They will be removed from the file. This can’t be undone.',
          confirmLabel: 'Discard',
          destructive: true,
        })
        if (!ok) return
      }
      await runAction(repoPath, () => api.invoke('repo:applyPatch', repoPath, text, action))
    }

    const actionsFor = (ids: string[]) =>
      area === 'staged' ? (
        reversePartialOk && (
          <SmallButton
            label="Unstage"
            icon={<Minus />}
            onClick={() => void apply(ids, 'unstage')}
          />
        )
      ) : (
        <>
          {!untracked && reversePartialOk && (
            <SmallButton
              label="Discard"
              icon={<Undo2 />}
              onClick={() => void apply(ids, 'discard')}
            />
          )}
          <SmallButton label="Stage" icon={<Plus />} onClick={() => void apply(ids, 'stage')} />
        </>
      )

    let rendered = 0
    body = (
      <div className="h-full overflow-auto font-mono text-xs select-text" data-testid="patch-view">
        {selected.size > 0 && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-accent px-3 py-1 font-sans">
            <span className="text-sm">
              {selected.size} {selected.size === 1 ? 'line' : 'lines'} selected
            </span>
            <div className="ml-auto flex gap-1">
              {actionsFor([...selected])}
              <SmallButton
                label="Clear"
                onClick={() => setSelection({ patch, ids: new Set(), anchor: null })}
              />
            </div>
          </div>
        )}
        {patch.hunks.map((hunk, hunkIndex) => {
          if (rendered >= MAX_LINES) return null
          // Positions of the next line on each side, for finding its highlighting.
          let oldIndex = 0
          let newIndex = 0
          return (
            <div key={hunkIndex} className="border-b">
              <div className="flex items-center gap-2 bg-muted px-3 py-0.5 text-muted-foreground">
                <span className="truncate">
                  @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@{' '}
                  {hunk.context}
                </span>
                <div className="ml-auto flex gap-1 font-sans">
                  {actionsFor(hunkLineIds(patch, hunkIndex))}
                </div>
              </div>
              {hunk.lines.map((line, index) => {
                if (rendered++ >= MAX_LINES) return null
                const id = lineId(hunkIndex, index)
                const sides = highlighted?.[hunkIndex]
                let segments: Segment[] | undefined
                if (line.kind === 'delete') segments = sides?.old[oldIndex++]
                else if (line.kind === 'add') segments = sides?.new[newIndex++]
                else {
                  oldIndex++ // context lines are on both sides
                  segments = sides?.new[newIndex++]
                }
                const selectable =
                  line.kind !== 'context' && (area !== 'staged' || reversePartialOk)
                return (
                  <Line
                    key={index}
                    line={line}
                    segments={segments}
                    selected={selected.has(id)}
                    onClick={
                      selectable
                        ? (event) =>
                            setSelection({
                              patch,
                              ids:
                                event.shiftKey && anchor
                                  ? selectRange(selected, ordered, anchor, id)
                                  : toggleLine(selected, id),
                              anchor: id,
                            })
                        : undefined
                    }
                  />
                )
              })}
            </div>
          )
        })}
        {rendered > MAX_LINES && (
          <Message>
            This diff is too large to show completely. Stage or discard the whole file from the
            list.
          </Message>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  )
}

function Line(props: {
  line: PatchLine
  /** Syntax-highlighted pieces of the line, if its language is known. */
  segments?: Segment[] | undefined
  selected: boolean
  onClick?: (event: React.MouseEvent) => void
}) {
  const { line } = props
  const sign = line.kind === 'add' ? '+' : line.kind === 'delete' ? '-' : ' '
  return (
    <div
      role={props.onClick ? 'checkbox' : undefined}
      aria-checked={props.onClick ? props.selected : undefined}
      onClick={props.onClick}
      data-line-kind={line.kind}
      className={cn(
        'flex min-w-max leading-5',
        line.kind === 'add' && 'bg-[var(--diff-insert)]',
        line.kind === 'delete' && 'bg-[var(--diff-delete)]',
        props.selected && line.kind === 'add' && 'bg-[var(--diff-insert-strong)]',
        props.selected && line.kind === 'delete' && 'bg-[var(--diff-delete-strong)]',
        props.onClick && 'cursor-pointer',
      )}
    >
      <span className={cn('w-1 shrink-0', props.selected && 'bg-ring')} />
      <span className="w-10 shrink-0 pr-2 text-right text-muted-foreground select-none">
        {line.oldLine ?? ''}
      </span>
      <span className="w-10 shrink-0 pr-2 text-right text-muted-foreground select-none">
        {line.newLine ?? ''}
      </span>
      <span className="w-4 shrink-0 text-center select-none">{sign}</span>
      <span className="pr-4 whitespace-pre">
        {props.segments?.length
          ? props.segments.map((segment, i) =>
              segment.className ? (
                <span key={i} className={segment.className}>
                  {segment.text}
                </span>
              ) : (
                segment.text
              ),
            )
          : line.text || ' '}
      </span>
    </div>
  )
}

function SmallButton(props: { label: string; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="outline" size="xs" onClick={props.onClick} className="h-6">
      {props.icon}
      {props.label}
    </Button>
  )
}

function Message({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  )
}
