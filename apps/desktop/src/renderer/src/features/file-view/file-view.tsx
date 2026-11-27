/**
 * The File view: one file's blame or history.
 *
 * - Blame: every line with the commit, author and date that last changed it.
 *   Click a commit label to see it in the History view, or "Before this
 *   change" to blame the file as it was just before that commit.
 * - History: every commit that changed the file (following renames), with
 *   the file's diff in each.
 *
 * Opened from the right-click menu on files (commit details, Changes view).
 */
import { LoadingState } from '@/components/loading-state'
import { useMemo } from 'react'
import { ArrowLeft, History, ScanText, Undo2, X } from 'lucide-react'
import type { FileViewState } from '@/features/repo-view/repo-view-store'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { useBlame, useFileHistory } from '@/features/repos/use-repo-data'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { usePanelLayout } from '@/features/layout/panel-layout'
import { Button } from '@/components/ui/button'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { DiffPanel } from '@/features/diff/diff-panel'
import { cn } from '@/lib/utils'
import { formatDateTime, formatRelativeDate, shortSha } from '@/lib/format'
import { ageScale, groupBlameLines } from './blame-groups'

/** Don't render more lines than this in the blame view. */
const MAX_BLAME_LINES = 10_000
const UNCOMMITTED = '0'.repeat(40)

export function FileView({ repoPath, file }: { repoPath: string; file: FileViewState }) {
  const [, setView] = useRepoView(repoPath)
  const setFile = (patch: Partial<FileViewState>) => setView({ file: { ...file, ...patch } })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <FilePath path={file.path} />
        <div className="ml-3 flex rounded-md border p-0.5">
          <ModeButton active={file.mode === 'blame'} onClick={() => setFile({ mode: 'blame' })}>
            <ScanText className="size-3.5" />
            Blame
          </ModeButton>
          <ModeButton active={file.mode === 'history'} onClick={() => setFile({ mode: 'history' })}>
            <History className="size-3.5" />
            History
          </ModeButton>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          aria-label="Close file"
          onClick={() => setView({ view: 'history', file: null })}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {file.mode === 'blame' ? (
          <BlameView repoPath={repoPath} file={file} setFile={setFile} />
        ) : (
          <FileHistoryView repoPath={repoPath} file={file.path} />
        )}
      </div>
    </div>
  )
}

function ModeButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-0.5 text-xs',
        props.active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {props.children}
    </button>
  )
}

function BlameView(props: {
  repoPath: string
  file: FileViewState
  setFile: (patch: Partial<FileViewState>) => void
}) {
  const { repoPath, file, setFile } = props
  const [, setView] = useRepoView(repoPath)
  const at = file.revisions.at(-1)
  const { data, error } = useBlame(repoPath, at?.path ?? file.path, at?.sha)

  const groups = useMemo(() => groupBlameLines(data?.lines.slice(0, MAX_BLAME_LINES) ?? []), [data])
  const age = useMemo(
    () => ageScale(Object.values(data?.commits ?? {}).map((c) => c.authorTime)),
    [data],
  )

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return <LoadingState label="Loading blame…" />

  const showCommit = (sha: string) =>
    setView({ view: 'history', selectedSha: sha, seekSelected: true, selectedFile: null })

  return (
    <div className="flex h-full min-h-0 flex-col">
      {at && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted px-3 py-1 text-xs">
          <span>
            Showing <span className="font-mono">{at.path}</span> as it was at{' '}
            <span className="font-mono">{shortSha(at.sha)}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            onClick={() => setFile({ revisions: file.revisions.slice(0, -1) })}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setFile({ revisions: [] })}>
            Current file
          </Button>
        </div>
      )}
      <div
        className="min-h-0 flex-1 overflow-auto font-mono text-xs select-text"
        data-testid="blame-view"
      >
        {groups.map((group, index) => {
          const commit = data.commits[group.sha]
          const uncommitted = group.sha === UNCOMMITTED
          const strength = commit && !uncommitted ? 0.15 + age(commit.authorTime) * 0.85 : 0
          return (
            <div key={index} className="flex border-b border-dashed last:border-b-0">
              <div
                className="w-1 shrink-0"
                style={{
                  background: `color-mix(in oklch, var(--brand) ${Math.round(strength * 100)}%, transparent)`,
                }}
                title={commit ? formatDateTime(commit.authorTime) : undefined}
              />
              <div className="group/blame w-72 shrink-0 border-r px-2 py-0.5 font-sans">
                {uncommitted ? (
                  <span className="text-muted-foreground italic">Not committed yet</span>
                ) : commit ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => showCommit(group.sha)}
                      title={`${commit.summary}\n${commit.author}, ${formatDateTime(commit.authorTime)}\nClick to show this commit`}
                      className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left hover:underline"
                    >
                      <span className="font-mono text-muted-foreground">{shortSha(group.sha)}</span>
                      <span className="truncate">{commit.summary}</span>
                    </button>
                    {commit.previous && (
                      <button
                        type="button"
                        aria-label="Blame before this change"
                        title="Blame the file as it was before this change"
                        onClick={() =>
                          setFile({ revisions: [...file.revisions, commit.previous!] })
                        }
                        className="text-muted-foreground opacity-0 group-hover/blame:opacity-100 hover:text-foreground"
                      >
                        <Undo2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ) : null}
                {commit && !uncommitted && group.lines.length > 1 && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {commit.author}, {formatRelativeDate(commit.authorTime)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {group.lines.map((line) => (
                  <div key={line.line} className="flex leading-5">
                    <span className="w-12 shrink-0 pr-2 text-right text-muted-foreground select-none">
                      {line.line}
                    </span>
                    <span className="pr-4 whitespace-pre">{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {data.lines.length > MAX_BLAME_LINES && (
          <p className="p-3 font-sans text-muted-foreground">
            Showing the first {MAX_BLAME_LINES} lines.
          </p>
        )}
      </div>
    </div>
  )
}

function FileHistoryView({ repoPath, file }: { repoPath: string; file: string }) {
  const { data, error } = useFileHistory(repoPath, file)
  const [view, setView] = useRepoView(repoPath)
  const selected = view.selectedFile?.kind === 'commit' ? view.selectedFile : null
  const layout = usePanelLayout('file-history-layout', ['list', 'diff'])

  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return <LoadingState label="Loading file history…" />
  if (data.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        This file has no committed history yet.
      </p>
    )
  }

  return (
    <ResizablePanelGroup orientation="horizontal" {...layout}>
      <ResizablePanel id="list" defaultSize="35%" minSize="20%">
        <ul className="h-full overflow-y-auto py-1" data-testid="file-history">
          {data.map((entry) => {
            const active = selected?.sha === entry.commit.sha
            return (
              <li key={entry.commit.sha}>
                <button
                  type="button"
                  onClick={() =>
                    setView({
                      selectedFile: {
                        kind: 'commit',
                        sha: entry.commit.sha,
                        path: entry.path,
                        ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
                      },
                    })
                  }
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm',
                    active ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <ChangeBadge change={entry.change} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.commit.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {shortSha(entry.commit.sha)} · {entry.commit.authorName} ·{' '}
                      {formatRelativeDate(entry.commit.authorDate)}
                      {entry.oldPath && ` · renamed from ${entry.oldPath}`}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="diff" minSize="30%">
        <DiffPanel repoPath={repoPath} target={selected} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
