/**
 * Git LFS in the UI:
 * - LfsSection: the sidebar section (only for repositories that use LFS):
 *   the tracked patterns, a warning if git-lfs isn't installed, and the
 *   locked files.
 * - LfsMenuItems: "Git LFS" in a file's right-click menu: track its type,
 *   lock or unlock it.
 * - LfsLocksDialog: the files locked on the server, with Unlock.
 *
 * Normal fetch, pull, push and checkout already handle LFS files (git-lfs
 * hooks into them), so there's nothing extra to do there.
 */
import { create } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Lock, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { runAction } from '@/lib/run-action'
import { formatRelativeDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Item, Section } from '@/features/sidebar/sidebar-parts'

export function useLfs(repo: string) {
  return useQuery({
    queryKey: ['repo', repo, 'lfs'],
    queryFn: () => api.invoke('repo:getLfs', repo),
  })
}

/** The "*.ext" pattern for a file, or null if it has no extension. */
export function extensionPattern(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `*${name.slice(dot)}` : null
}

export const lfsTrack = (repo: string, pattern: string) =>
  runAction(repo, () => api.invoke('repo:lfsTrack', repo, pattern), {
    success: `Files matching ${pattern} will be stored with Git LFS. Commit .gitattributes to share this.`,
  })

const lfsUntrack = (repo: string, pattern: string) =>
  runAction(repo, () => api.invoke('repo:lfsUntrack', repo, pattern), {
    success: `${pattern} no longer uses Git LFS. Commit .gitattributes to share this.`,
  })

const unlock = (repo: string, file: string, force = false) =>
  runAction(repo, () => api.invoke('repo:lfsUnlock', repo, file, force), {
    success: `Unlocked ${file}`,
  })

const useLocksDialog = create<{ repo: string | null }>(() => ({ repo: null }))
export const openLfsLocks = (repo: string) => useLocksDialog.setState({ repo })

export function LfsSection({ repoPath }: { repoPath: string }) {
  const lfs = useLfs(repoPath).data
  // Only for repositories that use LFS.
  if (!lfs || lfs.patterns.length === 0) return null
  return (
    <Section title="Git LFS" icon={HardDrive} count={lfs.patterns.length} defaultOpen={false}>
      {!lfs.version && (
        <Item
          label="Git LFS isn’t installed"
          selected={false}
          leading={<TriangleAlert className="size-3.5 shrink-0 text-change-modified" />}
          title="This repository stores large files with Git LFS. Without it you only get small pointer files. Click to open git-lfs.com."
          onClick={() => window.open('https://git-lfs.com', '_blank')}
        />
      )}
      {lfs.patterns.map((pattern) => (
        <ContextMenu key={pattern}>
          <ContextMenuTrigger asChild>
            <Item
              label={pattern}
              selected={false}
              title={`Files matching ${pattern} are stored with Git LFS. Right-click to stop.`}
            />
          </ContextMenuTrigger>
          <ContextMenuContent className="w-60">
            <ContextMenuItem
              disabled={!lfs.version}
              onSelect={() => void lfsUntrack(repoPath, pattern)}
            >
              Stop using LFS for {pattern}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {lfs.version && (
        <Item
          label="Locked files…"
          selected={false}
          leading={<Lock className="size-3.5 shrink-0 text-muted-foreground" />}
          onClick={() => openLfsLocks(repoPath)}
        />
      )}
    </Section>
  )
}

/** "Git LFS" items for a file's right-click menu (only when git-lfs is installed). */
export function LfsMenuItems({ repo, path }: { repo: string; path: string }) {
  const lfs = useLfs(repo).data
  if (!lfs?.version) return null
  const pattern = extensionPattern(path)
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Git LFS</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-64">
        {pattern && !lfs.patterns.includes(pattern) && (
          <ContextMenuItem onSelect={() => void lfsTrack(repo, pattern)}>
            Store all {pattern} files with LFS
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() =>
            void runAction(repo, () => api.invoke('repo:lfsLock', repo, path), {
              success: `Locked ${path}. Others can’t push changes to it until you unlock it.`,
            })
          }
        >
          Lock file
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void unlock(repo, path)}>Unlock file</ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

export function LfsLocksDialog() {
  const repo = useLocksDialog((s) => s.repo)
  return (
    <Dialog
      open={repo !== null}
      onOpenChange={(open) => !open && useLocksDialog.setState({ repo: null })}
    >
      {repo && <LocksContent repo={repo} />}
    </Dialog>
  )
}

function LocksContent({ repo }: { repo: string }) {
  const locks = useQuery({
    queryKey: ['repo', repo, 'lfs-locks'],
    queryFn: () => api.invoke('repo:getLfsLocks', repo),
  })
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Locked files</DialogTitle>
        <DialogDescription>
          Files locked on the Git LFS server. Only the person who locked a file can push changes to
          it.
        </DialogDescription>
      </DialogHeader>
      {locks.error ? (
        <p className="text-sm text-destructive">
          {errorMessage(locks.error)} (The server may not support locking.)
        </p>
      ) : !locks.data ? (
        <p className="text-sm text-muted-foreground">Asking the server…</p>
      ) : locks.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files are locked.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {locks.data.map((lock) => (
            <li key={lock.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate" title={lock.path}>
                {lock.path}
              </span>
              <span className="text-xs text-muted-foreground">
                {lock.owner}
                {lock.lockedAt ? `, ${formatRelativeDate(lock.lockedAt)}` : ''}
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => void unlock(repo, lock.path).then(() => locks.refetch())}
              >
                Unlock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  )
}
