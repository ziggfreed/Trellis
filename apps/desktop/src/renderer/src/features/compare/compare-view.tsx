/**
 * The Compare view: what one branch (or commit) has that another doesn't,
 * like a pull request. Shows the commits, the files changed since the two
 * split, and each file's diff.
 */
import { ArrowLeftRight, X } from 'lucide-react'
import type { CompareState } from '@/features/repo-view/repo-view-store'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { useComparison } from '@/features/repos/use-repo-data'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { usePanelLayout } from '@/features/layout/panel-layout'
import { Button } from '@/components/ui/button'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { DiffPanel } from '@/features/diff/diff-panel'
import { cn } from '@/lib/utils'
import { formatRelativeDate, shortSha } from '@/lib/format'

/** Show a long commit hash short, but leave branch names alone. */
const label = (ref: string) => (/^[0-9a-f]{40}$/.test(ref) ? shortSha(ref) : ref)

export function CompareView({ repoPath, compare }: { repoPath: string; compare: CompareState }) {
  const [view, setView] = useRepoView(repoPath)
  const { data, error } = useComparison(repoPath, compare.base, compare.head)
  const selected = view.selectedFile?.kind === 'range' ? view.selectedFile : null
  const layout = usePanelLayout('compare-layout', ['list', 'diff'])
  const swap = () =>
    setView({ compare: { base: compare.head, head: compare.base }, selectedFile: null })

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="compare-view">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3 text-sm">
        <span>
          <span className="font-medium">{label(compare.head)}</span>
          <span className="text-muted-foreground"> compared with </span>
          <span className="font-medium">{label(compare.base)}</span>
        </span>
        {data && (
          <span className="text-xs text-muted-foreground" data-testid="compare-summary">
            {data.commits.length} {data.commits.length === 1 ? 'commit' : 'commits'} ahead,{' '}
            {data.behind} behind · {data.files.length} {data.files.length === 1 ? 'file' : 'files'}{' '}
            changed
          </span>
        )}
        <Button variant="ghost" size="xs" className="ml-auto" onClick={swap}>
          <ArrowLeftRight />
          Swap
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close comparison"
          onClick={() => setView({ view: 'history', compare: null, selectedFile: null })}
        >
          <X />
        </Button>
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : !data ? null : (
        <ResizablePanelGroup orientation="horizontal" {...layout} className="min-h-0 flex-1">
          <ResizablePanel id="list" defaultSize="35%" minSize="20%">
            <div className="h-full overflow-y-auto py-1">
              {data.mergeBase === null && (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  These have no history in common.
                </p>
              )}
              {data.mergeBase !== null && data.commits.length === 0 && (
                // Nothing to show this way round; explain, and offer the other direction.
                <div className="space-y-2 px-3 py-2 text-sm" data-testid="compare-empty">
                  <p className="text-muted-foreground">
                    {data.behind === 0
                      ? `${label(compare.head)} and ${label(compare.base)} point to the same commit.`
                      : `${label(compare.head)} has no commits that ${label(compare.base)} doesn’t.`}
                  </p>
                  {data.behind > 0 && (
                    <Button variant="outline" size="xs" onClick={swap}>
                      <ArrowLeftRight />
                      Show what {label(compare.base)} has instead
                    </Button>
                  )}
                </div>
              )}
              <h3 className="px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Files ({data.files.length})
              </h3>
              <ul>
                {data.files.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() =>
                        setView({
                          selectedFile: {
                            kind: 'range',
                            from: data.mergeBase!,
                            to: compare.head,
                            path: file.path,
                            ...(file.oldPath ? { oldPath: file.oldPath } : {}),
                          },
                        })
                      }
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1 text-left text-sm',
                        selected?.path === file.path ? 'bg-accent' : 'hover:bg-accent/50',
                      )}
                    >
                      <ChangeBadge change={file.change} />
                      <FilePath path={file.path} oldPath={file.oldPath} className="flex-1" />
                      {file.additions !== null && (
                        <span className="shrink-0 font-mono text-xs">
                          <span className="text-change-added">+{file.additions}</span>{' '}
                          <span className="text-change-deleted">−{file.deletions}</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Commits ({data.commits.length})
              </h3>
              <ul>
                {data.commits.map((commit) => (
                  <li key={commit.sha}>
                    <button
                      type="button"
                      onClick={() =>
                        setView({
                          view: 'history',
                          selectedSha: commit.sha,
                          seekSelected: true,
                          selectedFile: null,
                        })
                      }
                      title="Show in history"
                      className="flex w-full items-baseline gap-2 px-3 py-1 text-left text-sm hover:bg-accent/50"
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {shortSha(commit.sha)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelativeDate(commit.authorDate)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="diff" minSize="30%">
            <DiffPanel repoPath={repoPath} target={selected} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  )
}
