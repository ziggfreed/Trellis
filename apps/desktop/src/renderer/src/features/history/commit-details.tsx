/**
 * Details of the selected commit: message, author, dates, parents and the
 * list of changed files. Clicking a file shows its diff.
 */
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { ChangedFile } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { formatDateTime, shortSha } from '@/lib/format'
import { ChangeBadge } from '@/components/change-badge'
import { FilePath } from '@/components/file-path'
import { useCommitDetails } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'

export function CommitDetails({ repoPath }: { repoPath: string }) {
  const [view, setView] = useRepoView(repoPath)
  const { data, error } = useCommitDetails(repoPath, view.selectedSha)

  if (!view.selectedSha) {
    return (
      <p className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        Select a commit to see its details.
      </p>
    )
  }
  if (error) return <p className="p-4 text-sm text-destructive">{error.message}</p>
  if (!data) return null

  const { commit, files } = data
  const selectedPath =
    view.selectedFile?.kind === 'commit' && view.selectedFile.sha === commit.sha
      ? view.selectedFile.path
      : null
  const selectFile = (file: ChangedFile) =>
    setView({
      selectedFile: {
        kind: 'commit',
        sha: commit.sha,
        path: file.path,
        ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      },
    })

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="commit-details">
      <div className="max-h-[50%] shrink-0 space-y-3 overflow-y-auto border-b p-3 select-text">
        <div>
          <h2 className="font-semibold">{commit.subject}</h2>
          {commit.body && (
            <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{commit.body}</p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Author</dt>
          <dd>
            {commit.authorName} &lt;{commit.authorEmail}&gt;, {formatDateTime(commit.authorDate)}
          </dd>
          {(commit.committerEmail !== commit.authorEmail ||
            commit.commitDate !== commit.authorDate) && (
            <>
              <dt className="text-muted-foreground">Committer</dt>
              <dd>
                {commit.committerName}, {formatDateTime(commit.commitDate)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Commit</dt>
          <dd className="flex items-center gap-1 font-mono">
            {commit.sha}
            <button
              type="button"
              aria-label="Copy commit hash"
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                void navigator.clipboard.writeText(commit.sha).then(() => toast.success('Copied'))
              }
            >
              <Copy className="size-3" />
            </button>
          </dd>
          {commit.parents.length > 0 && (
            <>
              <dt className="text-muted-foreground">
                {commit.parents.length > 1 ? 'Parents' : 'Parent'}
              </dt>
              <dd className="flex gap-2 font-mono">
                {commit.parents.map((parent) => (
                  <button
                    key={parent}
                    type="button"
                    className="text-brand hover:underline"
                    onClick={() => setView({ selectedSha: parent, selectedFile: null })}
                  >
                    {shortSha(parent)}
                  </button>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="shrink-0 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        {files.length} {files.length === 1 ? 'file' : 'files'} changed
        {commit.parents.length > 1 && ' (compared with the first parent)'}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => selectFile(file)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1 text-left text-sm',
                selectedPath === file.path ? 'bg-accent' : 'hover:bg-accent/50',
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
    </div>
  )
}
