/**
 * Submodules in the repository sidebar (shown only when the repository has
 * some): each one's state, with actions to initialise/update it, open it in
 * its own tab, or add a new submodule.
 *
 * Git keeps a submodule at a recorded commit. "Not set up" means its folder
 * is empty (common right after cloning): Update checks it out.
 */
import { useQuery } from '@tanstack/react-query'
import { Boxes, CircleAlert, CircleDashed, CircleDot } from 'lucide-react'
import type { Submodule } from '@shared/ipc'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { shortSha } from '@/lib/format'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { textDialog } from '@/features/dialogs/dialog-store'
import { trackOperation } from '@/features/repo-actions/operations-store'
import { copyToClipboard } from '@/features/repo-actions/actions'
import { openRepoAtPath } from '@/features/repos/use-repos'
import { joinPath } from '@/features/create-repo/clone-paths'
import { Item, Section } from '@/features/sidebar/sidebar-parts'

export function useSubmodules(repo: string) {
  return useQuery({
    queryKey: ['repo', repo, 'submodules'],
    queryFn: () => api.invoke('repo:getSubmodules', repo),
  })
}

/** Initialise and update submodules (all of them when `paths` is empty). */
export function updateSubmodules(repo: string, paths: string[] = []) {
  return runAction(
    repo,
    () =>
      trackOperation(repo, 'Updating submodules', (id) =>
        api.invoke('repo:updateSubmodules', id, repo, paths),
      ),
    { success: paths.length === 1 ? `Updated ${paths[0]}` : 'Updated submodules' },
  )
}

/** Ask for a URL and folder, then add a submodule. */
export async function addSubmodule(repo: string) {
  const url = await textDialog({
    title: 'Add submodule',
    description:
      'A submodule is another repository kept inside this one, pinned to a specific commit.',
    label: 'Repository URL',
    placeholder: 'https://github.com/owner/library.git',
    confirmLabel: 'Next',
    validate: (value) => (value.trim() ? null : 'Enter the URL.'),
  })
  if (!url) return
  const guess =
    url
      .trim()
      .replace(/\.git\/?$/, '')
      .split(/[/:]/)
      .pop() ?? ''
  const folder = await textDialog({
    title: 'Add submodule',
    label: 'Folder (inside this repository)',
    initialValue: guess,
    confirmLabel: 'Add submodule',
    validate: (value) =>
      !value.trim()
        ? 'Enter a folder.'
        : value.startsWith('/') || value.split('/').includes('..')
          ? 'Use a folder inside this repository, e.g. libs/name.'
          : null,
  })
  if (!folder) return
  await runAction(
    repo,
    () =>
      trackOperation(repo, 'Adding submodule', (id) =>
        api.invoke('repo:addSubmodule', id, repo, url.trim(), folder.trim()),
      ),
    { success: `Added ${folder.trim()}. Commit to record it.` },
  )
}

const STATES: Record<
  Submodule['state'],
  { label: string; Icon: typeof CircleDot; className: string }
> = {
  ok: { label: 'Up to date', Icon: CircleDot, className: 'text-muted-foreground' },
  changed: {
    label: 'Checked out at a different commit than recorded',
    Icon: CircleAlert,
    className: 'text-change-modified',
  },
  uninitialized: {
    label: 'Not set up yet: right-click > Update',
    Icon: CircleDashed,
    className: 'text-muted-foreground',
  },
  conflict: { label: 'Conflict', Icon: CircleAlert, className: 'text-destructive' },
}

export function SubmodulesSection({ repoPath }: { repoPath: string }) {
  const submodules = useSubmodules(repoPath).data ?? []
  // Most repositories have none: keep the sidebar tidy.
  if (submodules.length === 0) return null
  const open = (module: Submodule) => void openRepoAtPath(joinPath(repoPath, module.path))
  return (
    <Section
      title="Submodules"
      icon={Boxes}
      count={submodules.length}
      action={{ label: 'Add submodule', onClick: () => void addSubmodule(repoPath) }}
    >
      {submodules.map((module) => {
        const state = STATES[module.state]
        return (
          <ContextMenu key={module.path}>
            <ContextMenuTrigger asChild>
              <Item
                label={module.path}
                selected={false}
                title={`${module.path} (${shortSha(module.sha)})\n${state.label}\n${module.url}\n${
                  module.state === 'uninitialized' ? '' : 'Click to open in a tab'
                }`}
                leading={<state.Icon className={`size-3.5 shrink-0 ${state.className}`} />}
                onClick={() =>
                  module.state === 'uninitialized'
                    ? void updateSubmodules(repoPath, [module.path])
                    : open(module)
                }
              />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-60">
              <ContextMenuItem
                disabled={module.state === 'uninitialized'}
                onSelect={() => open(module)}
              >
                Open in a tab
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void updateSubmodules(repoPath, [module.path])}>
                {module.state === 'uninitialized' ? 'Set up (update)' : 'Update to recorded commit'}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void updateSubmodules(repoPath)}>
                Update all submodules
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => void copyToClipboard(module.url, 'URL')}>
                Copy URL
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() =>
                  void runAction(repoPath, () => api.invoke('repo:syncSubmodules', repoPath), {
                    success: 'Submodule URLs synced from .gitmodules',
                  })
                }
              >
                Sync URLs from .gitmodules
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </Section>
  )
}
