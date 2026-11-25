/**
 * Alternative views of a file's changes (see structured-diff.ts for the
 * logic):
 *
 * - MarkdownDiffView: the document rendered, with added blocks marked green
 *   and removed ones red, for reviewing prose and docs.
 * - JsonDiffView: a list of changed values by path, ignoring formatting and
 *   key order.
 * - LfsPointerView: for files stored with Git LFS, whose repository version
 *   is only a small pointer (shows the real sizes instead of the pointer text).
 *
 * Markdown is rendered with `marked` and cleaned with DOMPurify before it's
 * put in the page, so a document can't inject scripts or event handlers.
 */
import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { LfsPointer } from '@shared/ipc'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import { jsonChanges, markdownDiff, parseJson, previewJson } from './structured-diff'

/** Render one block of Markdown to safe HTML. */
function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true }))
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function MarkdownDiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = useMemo(() => markdownDiff(oldText, newText), [oldText, newText])
  if (!parts) return <Note>This document is too long to compare rendered. Use the line diff.</Note>
  return (
    <div className="h-full overflow-auto p-4" data-testid="markdown-diff">
      <div className="markdown-body mx-auto max-w-3xl space-y-1">
        {parts.map((part, index) => (
          <div
            key={index}
            data-change={part.kind}
            aria-label={
              part.kind === 'same' ? undefined : part.kind === 'added' ? 'Added' : 'Removed'
            }
            className={cn(
              'rounded-sm border-l-4 px-3 py-0.5',
              part.kind === 'same' && 'border-transparent',
              part.kind === 'added' && 'border-change-added bg-[var(--diff-insert)]',
              part.kind === 'removed' && 'border-change-deleted bg-[var(--diff-delete)] opacity-80',
            )}
            // Sanitised by renderMarkdown (DOMPurify).
            dangerouslySetInnerHTML={{ __html: renderMarkdown(part.value) }}
          />
        ))}
      </div>
    </div>
  )
}

export function JsonDiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const result = useMemo(() => {
    // A new or deleted file has one empty side; treat it as no value.
    const before = oldText.trim() ? parseJson(oldText) : ({ ok: true, value: undefined } as const)
    const after = newText.trim() ? parseJson(newText) : ({ ok: true, value: undefined } as const)
    if (!before.ok) return { error: `The old version isn’t valid JSON: ${before.error}` }
    if (!after.ok) return { error: `The new version isn’t valid JSON: ${after.error}` }
    return { changes: jsonChanges(before.value, after.value) }
  }, [oldText, newText])

  if ('error' in result) return <Note>{result.error} Use the line diff instead.</Note>
  if (result.changes.length === 0) {
    return <Note>No changes to the data; only formatting or key order changed.</Note>
  }
  return (
    <div className="h-full overflow-auto p-3" data-testid="json-diff">
      <p className="mb-2 text-xs text-muted-foreground">
        {result.changes.length} {result.changes.length === 1 ? 'change' : 'changes'} (formatting and
        key order ignored)
      </p>
      <ul className="space-y-1 font-mono text-xs">
        {result.changes.map((change, index) => (
          <li
            key={index}
            className="flex flex-wrap items-baseline gap-x-2 rounded px-2 py-1 hover:bg-accent"
          >
            <span
              className={cn(
                'w-4 shrink-0 text-center font-bold',
                change.kind === 'added' && 'text-change-added',
                change.kind === 'removed' && 'text-change-deleted',
                change.kind === 'changed' && 'text-change-modified',
              )}
              aria-label={change.kind}
            >
              {change.kind === 'added' ? '+' : change.kind === 'removed' ? '−' : '~'}
            </span>
            <span className="font-semibold">{change.path || '(whole document)'}</span>
            {change.kind !== 'added' && (
              <span className={cn(change.kind === 'changed' && 'text-change-deleted line-through')}>
                {previewJson(change.before)}
              </span>
            )}
            {change.kind === 'changed' && <span className="text-muted-foreground">→</span>}
            {change.kind !== 'removed' && (
              <span className={cn(change.kind === 'changed' && 'text-change-added')}>
                {previewJson(change.after)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LfsPointerView(props: { before: LfsPointer | null; after: LfsPointer | null }) {
  const size = (pointer: LfsPointer | null) => (pointer ? formatBytes(pointer.size) : 'none')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
      <p className="font-medium">Large file stored with Git LFS</p>
      <p className="text-muted-foreground">
        {props.before && props.after
          ? `Changed from ${size(props.before)} to ${size(props.after)}.`
          : props.after
            ? `Added (${size(props.after)}).`
            : `Deleted (was ${size(props.before)}).`}{' '}
        The repository only stores a small pointer; the file itself is on the LFS server.
      </p>
    </div>
  )
}
