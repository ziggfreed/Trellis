/**
 * Right-click menus for branches, remote branches, tags, stashes and
 * commits. Each wraps its trigger element:
 *
 *   <BranchMenu repo={path} branch={ref}><button>main</button></BranchMenu>
 *
 * The menu items just call functions in ./actions.ts. Plugins can add
 * items to the commit, branch and file menus (PluginMenuItems).
 */
import type { Commit, Ref, Stash, Worktree } from '@shared/ipc'
import { openRepoAtPath } from '@/features/repos/use-repos'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { shortSha } from '@/lib/format'
import { remoteBranchShortName } from '@/features/sidebar/group-refs'
import * as actions from './actions'
import { api } from '@/lib/api'
import { runAction } from '@/lib/run-action'
import { openInteractiveRebase } from '@/features/rebase/rebase-store'
import { openCompareDialog } from '@/features/compare/compare-dialog'
import { PluginMenuItems } from '@/features/plugins/plugin-menu-items'
import { useRepoViewStore } from '@/features/repo-view/repo-view-store'

interface MenuProps {
  repo: string
  children: React.ReactNode
}

function Menu({ children, items }: { children: React.ReactNode; items: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">{items}</ContextMenuContent>
    </ContextMenu>
  )
}

export function BranchMenu({ repo, branch, children }: MenuProps & { branch: Ref }) {
  return (
    <Menu
      items={
        <>
          <ContextMenuItem
            disabled={branch.isHead}
            onSelect={() => void actions.checkoutBranch(repo, branch.name)}
          >
            Check out
          </ContextMenuItem>
          <ContextMenuItem
            disabled={branch.isHead}
            onSelect={() => void actions.mergeIntoCurrent(repo, branch.name)}
          >
            Merge into current branch…
          </ContextMenuItem>
          <ContextMenuItem
            disabled={branch.isHead}
            onSelect={() => void actions.rebaseOnto(repo, branch.name)}
          >
            Rebase current branch onto this…
          </ContextMenuItem>
          {branch.isHead && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => void actions.push(repo)}>Push</ContextMenuItem>
              <ContextMenuItem onSelect={() => void actions.pull(repo)}>Pull</ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={branch.isHead}
            onSelect={() => void actions.openCompare(repo, branch.name)}
          >
            Compare with current branch
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openCompareDialog(repo, branch.name)}>
            Compare with…
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void actions.createBranch(repo, { ref: branch.name, label: branch.name })
            }
          >
            Create branch from here…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.renameBranch(repo, branch.name)}>
            Rename…
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void actions.deleteBranch(repo, branch)}
          >
            Delete…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => void actions.copyToClipboard(branch.name, 'branch name')}
          >
            Copy name
          </ContextMenuItem>
          <PluginMenuItems location="branch" args={{ repo, branch: branch.name }} />
        </>
      }
    >
      {children}
    </Menu>
  )
}

export function RemoteBranchMenu({ repo, branch, children }: MenuProps & { branch: Ref }) {
  const local = remoteBranchShortName(branch)
  return (
    <Menu
      items={
        <>
          <ContextMenuItem onSelect={() => void actions.checkoutRemoteBranch(repo, branch)}>
            Check out as “{local}”
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.mergeIntoCurrent(repo, branch.name)}>
            Merge into current branch…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.rebaseOnto(repo, branch.name)}>
            Rebase current branch onto this…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void actions.openCompare(repo, branch.name)}>
            Compare with current branch
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openCompareDialog(repo, branch.name)}>
            Compare with…
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void actions.createBranch(repo, { ref: branch.name, label: branch.name })
            }
          >
            Create branch from here…
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void actions.deleteRemoteBranch(repo, branch)}
          >
            Delete on remote…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => void actions.copyToClipboard(branch.name, 'branch name')}
          >
            Copy name
          </ContextMenuItem>
          <PluginMenuItems location="branch" args={{ repo, branch: branch.name }} />
        </>
      }
    >
      {children}
    </Menu>
  )
}

export function TagMenu({ repo, tag, children }: MenuProps & { tag: Ref }) {
  return (
    <Menu
      items={
        <>
          <ContextMenuItem onSelect={() => void actions.checkoutCommit(repo, tag.sha)}>
            Check out…
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => void actions.createBranch(repo, { ref: tag.name, label: tag.name })}
          >
            Create branch from here…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.openCompare(repo, tag.name)}>
            Compare with current branch
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openCompareDialog(repo, tag.name)}>
            Compare with…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void actions.pushTag(repo, tag.name)}>
            Push tag
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void actions.deleteTag(repo, tag.name)}
          >
            Delete…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void actions.copyToClipboard(tag.name, 'tag name')}>
            Copy name
          </ContextMenuItem>
        </>
      }
    >
      {children}
    </Menu>
  )
}

export function StashMenu({ repo, stash, children }: MenuProps & { stash: Stash }) {
  return (
    <Menu
      items={
        <>
          <ContextMenuItem onSelect={() => void actions.applyStash(repo, stash, true)}>
            Apply and remove (pop)
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.applyStash(repo, stash, false)}>
            Apply and keep
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void actions.dropStash(repo, stash)}
          >
            Delete…
          </ContextMenuItem>
        </>
      }
    >
      {children}
    </Menu>
  )
}

export function CommitMenu({ repo, commit, children }: MenuProps & { commit: Commit }) {
  const short = shortSha(commit.sha)
  // The commit selected in the history list, offered as the other side of a comparison.
  const selectedSha = useRepoViewStore((s) => s.byRepo[repo]?.selectedSha ?? null)
  return (
    <Menu
      items={
        <>
          <ContextMenuItem
            onSelect={() => void actions.createBranch(repo, { ref: commit.sha, label: short })}
          >
            Create branch here…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.createTag(repo, commit.sha)}>
            Create tag here…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.checkoutCommit(repo, commit.sha)}>
            Check out…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.openCompare(repo, commit.sha)}>
            Compare with current branch
          </ContextMenuItem>
          {selectedSha && selectedSha !== commit.sha && (
            <ContextMenuItem
              onSelect={() => void actions.openCompare(repo, commit.sha, selectedSha)}
            >
              Compare with selected commit ({shortSha(selectedSha)})
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => openCompareDialog(repo, commit.sha)}>
            Compare with…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void openInteractiveRebase(repo, commit)}>
            Interactive rebase from here…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.cherryPick(repo, commit.sha)}>
            Cherry-pick onto current branch
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.revertCommit(repo, commit.sha)}>
            Revert…
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Reset current branch to here</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-64">
              <ContextMenuItem onSelect={() => void actions.resetTo(repo, commit.sha, 'soft')}>
                Soft: keep changes staged
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void actions.resetTo(repo, commit.sha, 'mixed')}>
                Mixed: keep changes unstaged
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => void actions.resetTo(repo, commit.sha, 'hard')}
              >
                Hard: discard all changes…
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void actions.copyToClipboard(commit.sha, 'commit hash')}>
            Copy hash
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void actions.copyToClipboard(
                commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject,
                'message',
              )
            }
          >
            Copy message
          </ContextMenuItem>
          <PluginMenuItems location="commit" args={{ repo, sha: commit.sha }} />
        </>
      }
    >
      {children}
    </Menu>
  )
}

/** Menu for a file in a list (commit details, Changes view, file history...). */
export function FileMenu({ repo, path, children }: MenuProps & { path: string }) {
  return (
    <Menu
      items={
        <>
          <ContextMenuItem onSelect={() => actions.openFileView(repo, path, 'blame')}>
            Blame
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.openFileView(repo, path, 'history')}>
            File history
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => void runAction(repo, () => api.invoke('repo:openFile', repo, path))}
          >
            Open file
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.copyToClipboard(path, 'path')}>
            Copy path
          </ContextMenuItem>
          <PluginMenuItems location="file" args={{ repo, path }} />
        </>
      }
    >
      {children}
    </Menu>
  )
}

export function WorktreeMenu({ repo, worktree, children }: MenuProps & { worktree: Worktree }) {
  return (
    <Menu
      items={
        <>
          <ContextMenuItem onSelect={() => void openRepoAtPath(worktree.path)}>
            Open in a tab
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void runAction(repo, () => api.invoke('repo:showInFolder', worktree.path))
            }
          >
            Show in folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void actions.copyToClipboard(worktree.path, 'path')}>
            Copy path
          </ContextMenuItem>
          <ContextMenuSeparator />
          {worktree.prunable ? (
            <ContextMenuItem
              onSelect={() => void runAction(repo, () => api.invoke('repo:pruneWorktrees', repo))}
            >
              Forget missing worktrees
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              variant="destructive"
              disabled={worktree.isMain}
              onSelect={() => void actions.removeWorktree(repo, worktree)}
            >
              Remove worktree…
            </ContextMenuItem>
          )}
        </>
      }
    >
      {children}
    </Menu>
  )
}
