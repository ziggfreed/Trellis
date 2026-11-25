/**
 * "Ignore" in a file's right-click menu: add this file, every file with its
 * extension, or its folder to the repository's .gitignore.
 *
 * Ignoring only affects files git isn't tracking yet. If matching files are
 * already committed, Trellis offers to stop tracking them (they stay on
 * disk; the next commit removes them from the repository).
 */
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { confirmDialog } from '@/features/dialogs/dialog-store'

export type IgnoreKind = 'file' | 'extension' | 'folder'

/** The menu choices that make sense for `path`, with their labels. */
export function ignoreChoices(path: string): { kind: IgnoreKind; label: string }[] {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return [
    { kind: 'file' as const, label: 'Ignore this file' },
    ...(dot > 0
      ? [{ kind: 'extension' as const, label: `Ignore all *${name.slice(dot)} files` }]
      : []),
    ...(slash > 0
      ? [{ kind: 'folder' as const, label: `Ignore the folder ${path.slice(0, slash)}/` }]
      : []),
  ]
}

export async function ignore(repo: string, path: string, kind: IgnoreKind) {
  const result = await runAction(repo, () => api.invoke('repo:ignore', repo, path, kind))
  if (!result) return
  toast.success(
    result.added
      ? `Added ${result.pattern} to .gitignore`
      : `${result.pattern} is already in .gitignore`,
  )
  const tracked = result.trackedMatches
  if (tracked.length === 0) return
  const shown = tracked.slice(0, 5).join(', ') + (tracked.length > 5 ? '…' : '')
  const ok = await confirmDialog({
    title: `Stop tracking ${tracked.length} ${tracked.length === 1 ? 'file' : 'files'}?`,
    description: `Already committed, so .gitignore doesn’t affect ${tracked.length === 1 ? 'it' : 'them'}: ${shown}. Stop tracking ${tracked.length === 1 ? 'it' : 'them'}? The files stay on your computer; your next commit removes them from the repository.`,
    confirmLabel: 'Stop tracking',
  })
  if (ok) {
    await runAction(repo, () => api.invoke('repo:untrack', repo, tracked), {
      success: 'Stopped tracking. Commit to record the change.',
    })
  }
}
