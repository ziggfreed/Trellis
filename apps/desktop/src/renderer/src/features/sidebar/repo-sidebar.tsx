/**
 * The left sidebar of a repository: local branches, remotes, tags and
 * stashes. Clicking an item selects its commit in the history.
 *
 * Each section can be collapsed; the open/closed state is kept per section
 * name for the session. Right-click any item for actions (check out, merge,
 * delete...); double-click a branch to check it out.
 */
import { Archive, Cloud, FolderTree, GitBranch, Tag } from 'lucide-react'
import type { Ref } from '@shared/ipc'
import { useRefs, useRemotes, useStashes, useWorktrees } from '@/features/repos/use-repo-data'
import { openRepoAtPath } from '@/features/repos/use-repos'
import { toast } from 'sonner'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import {
  BranchMenu,
  RemoteBranchMenu,
  StashMenu,
  TagMenu,
  WorktreeMenu,
} from '@/features/repo-actions/menus'
import { addWorktree, checkoutBranch } from '@/features/repo-actions/actions'
import { draggableRef } from '@/features/drag-drop/drop-menu'
import { PluginPanels } from '@/features/plugins/plugin-panels'
import { Item, Section } from './sidebar-parts'
import { groupRemoteBranches, localBranches, remoteBranchShortName, sortedTags } from './group-refs'

export function RepoSidebar({ repoPath }: { repoPath: string }) {
  const refs = useRefs(repoPath).data ?? []
  const remotes = useRemotes(repoPath).data ?? []
  const stashes = useStashes(repoPath).data ?? []
  const worktrees = useWorktrees(repoPath).data ?? []
  const [view, setView] = useRepoView(repoPath)

  /**
   * Show a commit in the history view. Branches and tags are in the history,
   * so keep loading it until they're found (`seek`); stashes aren't, so don't.
   */
  const select = (sha: string, seek = true) =>
    setView({ view: 'history', selectedSha: sha, seekSelected: seek, selectedFile: null })

  const branches = localBranches(refs)
  const remoteGroups = groupRemoteBranches(refs, remotes)
  const tags = sortedTags(refs)

  return (
    <nav className="h-full overflow-y-auto py-2 text-sm" aria-label="Repository">
      <Section title="Branches" icon={GitBranch} count={branches.length}>
        {branches.map((branch) => (
          <BranchMenu key={branch.fullName} repo={repoPath} branch={branch}>
            <Item
              {...draggableRef(branch)}
              label={branch.name}
              selected={view.selectedSha === branch.sha}
              onClick={() => select(branch.sha)}
              onDoubleClick={() => !branch.isHead && void checkoutBranch(repoPath, branch.name)}
              strong={branch.isHead}
              title={`${branch.upstream ? `Tracking ${branch.upstream}` : 'No upstream branch'}. Double-click to check out; right-click for more.`}
              trailing={<AheadBehind branch={branch} />}
            />
          </BranchMenu>
        ))}
      </Section>

      <Section title="Remotes" icon={Cloud} count={remoteGroups.length}>
        {remoteGroups.map((group) => (
          <Section key={group.remote} title={group.remote} nested count={group.branches.length}>
            {group.branches.map((branch) => (
              <RemoteBranchMenu key={branch.fullName} repo={repoPath} branch={branch}>
                <Item
                  {...draggableRef(branch)}
                  label={remoteBranchShortName(branch)}
                  selected={view.selectedSha === branch.sha}
                  onClick={() => select(branch.sha)}
                  indent
                />
              </RemoteBranchMenu>
            ))}
          </Section>
        ))}
      </Section>

      <Section
        title="Worktrees"
        icon={FolderTree}
        count={worktrees.length}
        defaultOpen={worktrees.length > 1}
        action={{ label: 'New worktree', onClick: () => void addWorktree(repoPath) }}
      >
        {worktrees.map((worktree) => {
          const isThis = samePath(worktree.path, repoPath)
          return (
            <WorktreeMenu key={worktree.path} repo={repoPath} worktree={worktree}>
              <Item
                label={worktree.path.split(/[\\/]/).pop() ?? worktree.path}
                strong={isThis}
                selected={false}
                title={`${worktree.path}\n${worktree.branch ? `Branch ${worktree.branch}` : 'Detached'}${worktree.prunable ? '\nFolder missing' : ''}${isThis ? '\n(this tab)' : '\nClick to open in a tab'}`}
                onClick={() => !isThis && void openWorktree(worktree.path)}
                trailing={
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {worktree.prunable ? 'missing' : (worktree.branch ?? 'detached')}
                  </span>
                }
              />
            </WorktreeMenu>
          )
        })}
      </Section>

      <Section title="Tags" icon={Tag} count={tags.length} defaultOpen={false}>
        {tags.map((tag) => (
          <TagMenu key={tag.fullName} repo={repoPath} tag={tag}>
            <Item
              label={tag.name}
              selected={view.selectedSha === tag.sha}
              onClick={() => select(tag.sha)}
            />
          </TagMenu>
        ))}
      </Section>

      <Section title="Stashes" icon={Archive} count={stashes.length} defaultOpen={false}>
        {stashes.map((stash) => (
          <StashMenu key={stash.sha} repo={repoPath} stash={stash}>
            <Item
              label={stash.message}
              title={`${stash.name}: ${stash.message}. Right-click to apply or delete.`}
              selected={view.selectedSha === stash.sha}
              onClick={() => select(stash.sha, false)}
            />
          </StashMenu>
        ))}
      </Section>

      <PluginPanels repoPath={repoPath} />
    </nav>
  )
}

/** "↑2 ↓1" next to a branch that differs from its upstream. */
function AheadBehind({ branch }: { branch: Ref }) {
  if (branch.upstreamGone) {
    return (
      <span className="ml-auto text-xs text-muted-foreground" title="Upstream branch was deleted">
        gone
      </span>
    )
  }
  if (!branch.ahead && !branch.behind) return null
  return (
    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
      {branch.ahead > 0 && <span title={`${branch.ahead} commits to push`}>↑{branch.ahead}</span>}
      {branch.behind > 0 && (
        <span className="ml-1" title={`${branch.behind} commits to pull`}>
          ↓{branch.behind}
        </span>
      )}
    </span>
  )
}

/** Compare two paths, ignoring slash direction and letter case. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
  return norm(a) === norm(b)
}

async function openWorktree(path: string) {
  const result = await openRepoAtPath(path)
  if (result.ok === false) toast.error(result.message)
}
