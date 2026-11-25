/**
 * The changed files in the working tree, split in two lists, one above the
 * other: Staged (what the next commit will contain) on top, and Unstaged
 * below (with any merge conflicts first). The divider between them can be
 * dragged, and its position is remembered.
 *
 * - Click a file to see its diff (and stage single hunks or lines there).
 * - Ctrl/Cmd+click and Shift+click select several files (file-selection.ts).
 * - Each list's header has buttons for the whole list, or for the selected
 *   files when several are selected: stage/unstage, stash, discard.
 * - Hover a file for buttons; double-click it to move it to the other list.
 *   Both act on all the selected files if the file is one of them.
 * - Drag files (one, or the selection) from one list to the other.
 * - Right-click a file for the same actions plus blame, history, ignore...
 */
import { useState } from 'react'
import { Archive, Check, ExternalLink, Minus, Plus, Undo2 } from 'lucide-react'
import type { DiffTarget } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { usePanelLayout } from '@/features/layout/panel-layout'
import { FileMenu } from '@/features/repo-actions/menus'
import { groupChanges, type ChangeEntry } from './group-changes'
import {
  discardEntries,
  discardStagedEntries,
  stageEntries,
  stashEntries,
  unstageEntries,
} from './change-actions'
import {
  NO_SELECTION,
  clickSelection,
  filesForRow,
  selectedIn,
  type FileSelection,
  type ListArea,
} from './file-selection'

/** The diff to show for a change entry. */
export function targetFor(entry: ChangeEntry): DiffTarget {
  return entry.area === 'staged'
    ? { kind: 'staged', path: entry.path, ...(entry.origPath ? { oldPath: entry.origPath } : {}) }
    : { kind: 'unstaged', path: entry.path }
}

/**
 * Drag data types, one per source list. The type (unlike the data) can be
 * read while dragging, so a list can tell whether files come from the other
 * list and only then accept the drop.
 */
const DRAG_TYPE: Record<ListArea, string> = {
  staged: 'application/x-trellis-staged-files',
  unstaged: 'application/x-trellis-unstaged-files',
}
const other = (area: ListArea): ListArea => (area === 'staged' ? 'unstaged' : 'staged')

export function ChangesList({ repoPath }: { repoPath: string }) {
  const { data, error } = useStatus(repoPath)
  const [view, setView] = useRepoView(repoPath)
  const [selection, setSelection] = useState<FileSelection>(NO_SELECTION)
  const layout = usePanelLayout('changes-files-layout', ['staged', 'unstaged'])

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null

  const groups = groupChanges(data.files)
  const focused = view.selectedFile
  const isFocused = (entry: ChangeEntry) =>
    focused?.kind !== 'commit' &&
    focused?.path === entry.path &&
    focused.kind === (entry.area === 'staged' ? 'staged' : 'unstaged')

  const common = {
    repoPath,
    selection,
    setSelection,
    isFocused,
    onFocus: (entry: ChangeEntry) => setView({ selectedFile: targetFor(entry) }),
  }

  return (
    <div className="h-full" data-testid="changes-list">
      <ResizablePanelGroup orientation="vertical" {...layout}>
        <ResizablePanel id="staged" defaultSize="40%" minSize="15%">
          <FileListPane
            {...common}
            area="staged"
            entries={groups.staged}
            otherEntries={groups.unstaged}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="unstaged" minSize="15%">
          <FileListPane
            {...common}
            area="unstaged"
            entries={groups.unstaged}
            otherEntries={groups.staged}
            conflicts={groups.conflicted}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

interface PaneProps {
  repoPath: string
  area: ListArea
  entries: ChangeEntry[]
  /** The other list's files (where dropped files come from). */
  otherEntries: ChangeEntry[]
  /** Conflicted files, shown at the top of the Unstaged list. */
  conflicts?: ChangeEntry[]
  selection: FileSelection
  setSelection: (selection: FileSelection) => void
  isFocused: (entry: ChangeEntry) => boolean
  onFocus: (entry: ChangeEntry) => void
}

/** One of the two lists: header with buttons, then its files. */
function FileListPane(props: PaneProps) {
  const { repoPath, area, entries, selection } = props
  const [dropping, setDropping] = useState(false)
  const ordered = entries.map((e) => e.path)
  const selected = selectedIn(selection, area, ordered)
  const entriesFor = (paths: string[]) => entries.filter((e) => paths.includes(e.path))
  const staged = area === 'staged'
  const title = staged ? 'Staged' : 'Unstaged'

  // Move files to the other list (staging or unstaging them). A moved
  // selection stays selected there, so it can be moved straight back; after
  // a whole-list move nothing is selected, so the "all" buttons stay.
  const move = async (paths: string[], keepSelected: boolean) => {
    const moving = entriesFor(paths)
    if (!moving.length) return
    await (staged ? unstageEntries : stageEntries)(repoPath, moving)
    props.setSelection(
      keepSelected
        ? { area: other(area), paths: new Set(paths), anchor: paths[0] ?? null }
        : NO_SELECTION,
    )
  }
  const stash = (paths: string[]) => void stashEntries(repoPath, entriesFor(paths))
  const discard = (paths: string[]) =>
    void (staged ? discardStagedEntries : discardEntries)(repoPath, entriesFor(paths))

  // Header buttons act on the selection when several files are selected,
  // otherwise on the whole list.
  const multi = selected.length > 1
  const targets = multi ? selected : ordered
  const suffix = multi ? 'selected' : 'all'
  const labels = {
    move: staged ? `Unstage ${suffix}` : `Stage ${suffix}`,
    stash: multi ? 'Stash selected' : staged ? 'Stash staged files' : 'Stash unstaged files',
    // The Staged discard has its own name so "Discard all" stays unique.
    discard: multi ? 'Discard selected' : staged ? 'Discard staged changes' : 'Discard all',
  }

  const onDrop = (event: React.DragEvent) => {
    setDropping(false)
    const raw = event.dataTransfer.getData(DRAG_TYPE[other(area)])
    if (!raw) return
    event.preventDefault()
    const paths = JSON.parse(raw) as string[]
    const dropped = props.otherEntries.filter((e) => paths.includes(e.path))
    if (!dropped.length) return
    // The files come from the other list: stage or unstage them, and keep
    // them selected here.
    props.setSelection({ area, paths: new Set(paths), anchor: paths[0] ?? null })
    void (staged ? stageEntries : unstageEntries)(repoPath, dropped)
  }

  return (
    <section
      aria-label={title}
      className={cn(
        'flex h-full min-h-0 flex-col',
        dropping && 'bg-brand/10 ring-2 ring-brand ring-inset',
      )}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE[other(area)])) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDropping(true)
      }}
      onDragLeave={(event) => {
        // Ignore leaving one child for another inside the list.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b px-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title} ({entries.length})
        </h3>
        {multi && (
          <span className="ml-1 text-xs text-muted-foreground" data-testid="selection-count">
            · {selected.length} selected
          </span>
        )}
        <div className="ml-auto flex">
          <RowButton label={labels.stash} disabled={!targets.length} onClick={() => stash(targets)}>
            <Archive />
          </RowButton>
          <RowButton
            label={labels.discard}
            disabled={!targets.length}
            onClick={() => discard(targets)}
          >
            <Undo2 />
          </RowButton>
          <RowButton
            label={labels.move}
            disabled={!targets.length}
            onClick={() => void move(targets, multi)}
          >
            {staged ? <Minus /> : <Plus />}
          </RowButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {props.conflicts && props.conflicts.length > 0 && (
          <ConflictsSection {...props} conflicts={props.conflicts} />
        )}
        {entries.length === 0 && !props.conflicts?.length ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {staged
              ? 'Nothing staged yet. Stage files below (or drag them here) to choose what goes in the next commit.'
              : props.otherEntries.length
                ? 'No unstaged changes.'
                : 'No changes. Your working tree is clean.'}
          </p>
        ) : (
          <ul>
            {entries.map((entry) => {
              const files = filesForRow(selection, area, entry.path, ordered)
              const keep = files.length > 1
              const count = files.length > 1 ? `${files.length} files` : ''
              return (
                <Row
                  key={entry.path}
                  repoPath={repoPath}
                  entry={entry}
                  selected={selection.area === area && selection.paths.has(entry.path)}
                  focused={props.isFocused(entry)}
                  onClick={(event) => {
                    props.setSelection(
                      clickSelection(selection, area, entry.path, ordered, {
                        toggle: event.ctrlKey || event.metaKey,
                        range: event.shiftKey,
                      }),
                    )
                    props.onFocus(entry)
                  }}
                  onDoubleClick={() => void move(files, keep)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE[area], JSON.stringify(files))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  menuItems={
                    <>
                      <ContextMenuItem onSelect={() => void move(files, keep)}>
                        {staged ? 'Unstage' : 'Stage'} {count}
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => stash(files)}>
                        Stash {count}…
                      </ContextMenuItem>
                      <ContextMenuItem variant="destructive" onSelect={() => discard(files)}>
                        {staged ? 'Discard all changes' : 'Discard changes'}
                        {count && ` to ${count}`}…
                      </ContextMenuItem>
                    </>
                  }
                >
                  {staged ? (
                    <RowButton label="Unstage" onClick={() => void move(files, keep)}>
                      <Minus />
                    </RowButton>
                  ) : (
                    <>
                      <RowButton label="Discard changes" onClick={() => discard(files)}>
                        <Undo2 />
                      </RowButton>
                      <RowButton label="Stage" onClick={() => void move(files, keep)}>
                        <Plus />
                      </RowButton>
                    </>
                  )}
                </Row>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Merge conflicts, listed first in the Unstaged list until they're resolved. */
function ConflictsSection(props: PaneProps & { conflicts: ChangeEntry[] }) {
  const { repoPath } = props
  return (
    <section aria-label="Conflicts" className="mb-2">
      <h4 className="px-3 py-1 text-xs font-medium text-change-conflicted">
        Conflicts ({props.conflicts.length})
      </h4>
      <ul>
        {props.conflicts.map((entry) => (
          <Row
            key={entry.path}
            repoPath={repoPath}
            entry={entry}
            selected={false}
            focused={props.isFocused(entry)}
            onClick={() => props.onFocus(entry)}
          >
            <RowButton
              label="Open file"
              onClick={() =>
                void runAction(repoPath, () => api.invoke('repo:openFile', repoPath, entry.path))
              }
            >
              <ExternalLink />
            </RowButton>
            <RowButton
              label="Mark as resolved"
              onClick={() =>
                void runAction(repoPath, () => api.invoke('repo:stage', repoPath, [entry.path]))
              }
            >
              <Check />
            </RowButton>
          </Row>
        ))}
      </ul>
    </section>
  )
}

function Row(props: {
  repoPath: string
  entry: ChangeEntry
  /** Part of the multi-selection. */
  selected: boolean
  /** The file whose diff is shown. */
  focused: boolean
  onClick: (event: React.MouseEvent) => void
  onDoubleClick?: () => void
  onDragStart?: (event: React.DragEvent) => void
  menuItems?: React.ReactNode
  children: React.ReactNode
}) {
  const highlighted = props.selected || props.focused
  return (
    <li
      draggable={props.onDragStart !== undefined}
      onDragStart={props.onDragStart}
      data-selected={props.selected || undefined}
      className={cn(
        'group/row flex items-center gap-2 pr-1 pl-3 text-sm',
        highlighted ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <FileMenu repo={props.repoPath} path={props.entry.path} extraItems={props.menuItems}>
        <button
          type="button"
          aria-pressed={props.onDragStart ? props.selected : undefined}
          onClick={props.onClick}
          onDoubleClick={props.onDoubleClick}
          // Stop Shift+click from selecting text across rows.
          onMouseDown={(event) => event.shiftKey && event.preventDefault()}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <ChangeBadge change={props.entry.change} />
          <FilePath path={props.entry.path} oldPath={props.entry.origPath} className="flex-1" />
        </button>
      </FileMenu>
      <div
        className={cn(
          'flex shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100',
          highlighted && 'opacity-100',
        )}
      >
        {props.children}
      </div>
    </li>
  )
}

function RowButton(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}
