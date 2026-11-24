/**
 * The list of changed files in the working tree, grouped into conflicts,
 * staged and unstaged changes.
 *
 * - Click a file to see its diff (and stage individual hunks or lines there).
 * - Hover a file for buttons to stage, unstage or discard it; double-click
 *   to stage/unstage.
 * - Section headers have "all" versions of those buttons.
 */
import { Check, ExternalLink, Minus, Plus, Undo2 } from 'lucide-react'
import type { DiffTarget } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { useStatus } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { groupChanges, type ChangeEntry } from './group-changes'
import { discardEntries, stageEntries, unstageEntries } from './change-actions'
import { FileMenu } from '@/features/repo-actions/menus'

/** The diff to show for a change entry. */
export function targetFor(entry: ChangeEntry): DiffTarget {
  return entry.area === 'staged'
    ? { kind: 'staged', path: entry.path, ...(entry.origPath ? { oldPath: entry.origPath } : {}) }
    : { kind: 'unstaged', path: entry.path }
}

export function ChangesList({ repoPath }: { repoPath: string }) {
  const { data, error } = useStatus(repoPath)
  const [view, setView] = useRepoView(repoPath)

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null

  const groups = groupChanges(data.files)
  if (!groups.conflicted.length && !groups.staged.length && !groups.unstaged.length) {
    return (
      <p className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        No changes. Your working tree is clean.
      </p>
    )
  }

  const selected = view.selectedFile
  const isSelected = (entry: ChangeEntry) =>
    selected?.kind !== 'commit' &&
    selected?.path === entry.path &&
    selected.kind === (entry.area === 'staged' ? 'staged' : 'unstaged')

  const markResolved = (entry: ChangeEntry) =>
    runAction(repoPath, () => api.invoke('repo:stage', repoPath, [entry.path]))

  return (
    <div className="h-full overflow-y-auto py-1" data-testid="changes-list">
      <Section title="Conflicts" entries={groups.conflicted}>
        {groups.conflicted.map((entry) => (
          <Row
            repoPath={repoPath}
            key={entry.path}
            entry={entry}
            selected={isSelected(entry)}
            onSelect={() => setView({ selectedFile: targetFor(entry) })}
          >
            <RowButton
              label="Open file"
              onClick={() =>
                void runAction(repoPath, () => api.invoke('repo:openFile', repoPath, entry.path))
              }
            >
              <ExternalLink />
            </RowButton>
            <RowButton label="Mark as resolved" onClick={() => void markResolved(entry)}>
              <Check />
            </RowButton>
          </Row>
        ))}
      </Section>

      <Section
        title="Staged"
        entries={groups.staged}
        actions={
          <RowButton
            label="Unstage all"
            onClick={() => void unstageEntries(repoPath, groups.staged)}
          >
            <Minus />
          </RowButton>
        }
      >
        {groups.staged.map((entry) => (
          <Row
            repoPath={repoPath}
            key={entry.path}
            entry={entry}
            selected={isSelected(entry)}
            onSelect={() => setView({ selectedFile: targetFor(entry) })}
            onDoubleClick={() => void unstageEntries(repoPath, [entry])}
          >
            <RowButton label="Unstage" onClick={() => void unstageEntries(repoPath, [entry])}>
              <Minus />
            </RowButton>
          </Row>
        ))}
      </Section>

      <Section
        title="Unstaged"
        entries={groups.unstaged}
        actions={
          <>
            <RowButton
              label="Discard all"
              onClick={() => void discardEntries(repoPath, groups.unstaged)}
            >
              <Undo2 />
            </RowButton>
            <RowButton
              label="Stage all"
              onClick={() => void stageEntries(repoPath, groups.unstaged)}
            >
              <Plus />
            </RowButton>
          </>
        }
      >
        {groups.unstaged.map((entry) => (
          <Row
            repoPath={repoPath}
            key={entry.path}
            entry={entry}
            selected={isSelected(entry)}
            onSelect={() => setView({ selectedFile: targetFor(entry) })}
            onDoubleClick={() => void stageEntries(repoPath, [entry])}
          >
            <RowButton
              label="Discard changes"
              onClick={() => void discardEntries(repoPath, [entry])}
            >
              <Undo2 />
            </RowButton>
            <RowButton label="Stage" onClick={() => void stageEntries(repoPath, [entry])}>
              <Plus />
            </RowButton>
          </Row>
        ))}
      </Section>
    </div>
  )
}

function Section(props: {
  title: string
  entries: ChangeEntry[]
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  if (props.entries.length === 0) return null
  return (
    <section className="group/section mb-2" aria-label={props.title}>
      <div className="flex h-7 items-center px-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {props.title} ({props.entries.length})
        </h3>
        <div className="ml-auto flex opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          {props.actions}
        </div>
      </div>
      <ul>{props.children}</ul>
    </section>
  )
}

function Row(props: {
  repoPath: string
  entry: ChangeEntry
  selected: boolean
  onSelect: () => void
  onDoubleClick?: () => void
  children: React.ReactNode
}) {
  return (
    <li
      className={cn(
        'group/row flex items-center gap-2 pr-1 pl-3 text-sm',
        props.selected ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <FileMenu repo={props.repoPath} path={props.entry.path}>
        <button
          type="button"
          onClick={props.onSelect}
          onDoubleClick={props.onDoubleClick}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <ChangeBadge change={props.entry.change} />
          <FilePath path={props.entry.path} oldPath={props.entry.origPath} className="flex-1" />
        </button>
      </FileMenu>
      <div
        className={cn(
          'flex shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100',
          props.selected && 'opacity-100',
        )}
      >
        {props.children}
      </div>
    </li>
  )
}

function RowButton(props: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={props.label} onClick={props.onClick}>
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}
