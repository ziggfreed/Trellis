/**
 * The left sidebar of a repository: local branches, remotes, tags and
 * stashes. Clicking an item selects its commit in the history.
 *
 * Each section can be collapsed; the open/closed state is kept per section
 * name for the session. Right-click any item for actions (check out, merge,
 * delete...); double-click a branch (local or remote) to check it out.
 * Local branches that aren't on a remote are marked "local" or "gone".
 * Branches named with slashes (feature/login) are grouped into folders.
 *
 * The search box at the top filters every section as you type (see
 * sidebar-search.ts): sections and folders open to show what matches, and
 * sections with no matches are hidden. Enter selects the first match; Esc
 * clears the search.
 */
import { Archive, Broom, Cloud, FolderTree, GitBranch, Search, Tag, X } from 'lucide-react'
import type { Ref } from '@shared/ipc'
import { useRefs, useRemotes, useStashes, useWorktrees } from '@/features/repos/use-repo-data'
import { openRepoAtPath } from '@/features/repos/use-repos'
import { toast } from 'sonner'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import {
  BranchMenu,
  RemoteBranchMenu,
  RemoteMenu,
  StashMenu,
  TagMenu,
  WorktreeMenu,
} from '@/features/repo-actions/menus'
import { addWorktree, checkoutBranch, checkoutChoice } from '@/features/repo-actions/actions'
import { checkoutChoiceForRef } from '@/features/history/checkout-target'
import { openPruneDialog } from '@/features/repo-tools/prune-dialog'
import { draggableRef } from '@/features/drag-drop/drop-menu'
import { PluginPanels } from '@/features/plugins/plugin-panels'
import { SubmodulesSection } from '@/features/submodules/submodules'
import { LfsSection } from '@/features/lfs/lfs'
import { addRemote } from '@/features/repo-tools/remote-actions'
import { Item, Section } from './sidebar-parts'
import { buildBranchTree } from './branch-tree'
import { BranchTree } from './branch-tree-view'
import { REMOTE_STATE_TEXT, branchRemoteState } from './branch-remote-state'
import { groupRemoteBranches, localBranches, remoteBranchShortName, sortedTags } from './group-refs'
import { filterByWords, searchWords } from './sidebar-search'
import { shortcutLabel } from '@/features/shortcuts/shortcut-label'

export function RepoSidebar({ repoPath }: { repoPath: string }) {
  const refs = useRefs(repoPath).data ?? []
  const remotes = useRemotes(repoPath).data ?? []
  const allStashes = useStashes(repoPath).data ?? []
  const allWorktrees = useWorktrees(repoPath).data ?? []
  const [view, setView] = useRepoView(repoPath)
  const words = searchWords(view.sidebarSearch)
  const searching = words.length > 0

  /**
   * Show a commit in the history view. Branches and tags are in the history,
   * so keep loading it until they're found (`seek`); stashes aren't, so don't.
   */
  const select = (sha: string, seek = true) =>
    setView({ view: 'history', selectedSha: sha, seekSelected: seek, selectedFile: null })

  // What's shown: everything, or only what matches the search.
  const branches = filterByWords(localBranches(refs), words, (b) => b.name)
  const remoteGroups = groupRemoteBranches(refs, remotes)
    .map((group) => ({ ...group, branches: filterByWords(group.branches, words, (b) => b.name) }))
    .filter((group) => !searching || group.branches.length > 0)
  const tags = filterByWords(sortedTags(refs), words, (t) => t.name)
  const stashes = filterByWords(allStashes, words, (s) => s.message)
  const worktrees = filterByWords(
    allWorktrees,
    words,
    (w) => `${w.path.split(/[\\/]/).pop() ?? ''} ${w.branch ?? ''}`,
  )
  const remoteMatches = remoteGroups.reduce((sum, group) => sum + group.branches.length, 0)
  const nothingFound =
    searching &&
    !branches.length &&
    !remoteMatches &&
    !tags.length &&
    !stashes.length &&
    !worktrees.length
  /** While searching, hide sections with no matches. */
  const show = (count: number) => !searching || count > 0

  /** Enter in the search box: select the first match. */
  const selectFirst = () => {
    const first = branches[0] ?? remoteGroups.find((g) => g.branches.length)?.branches[0] ?? tags[0]
    if (first) select(first.sha)
    else if (stashes[0]) select(stashes[0].sha, false)
  }

  return (
    <nav className="h-full overflow-y-auto pb-2 text-sm" aria-label="Repository">
      <SidebarSearch
        value={view.sidebarSearch}
        onChange={(sidebarSearch) => setView({ sidebarSearch })}
        onEnter={selectFirst}
      />
      {nothingFound && (
        <p className="px-4 py-2 text-xs text-muted-foreground" data-testid="sidebar-no-matches">
          Nothing matches “{view.sidebarSearch.trim()}”.
        </p>
      )}
      {show(branches.length) && (
        <Section
          title="Branches"
          icon={GitBranch}
          count={branches.length}
          forceOpen={searching}
          action={{
            label: 'Clean up branches…',
            icon: Broom,
            onClick: () => openPruneDialog(repoPath),
          }}
        >
          <BranchTree
            nodes={buildBranchTree(branches, (b) => b.name)}
            depth={0}
            stateKey={`${repoPath}:local`}
            forceOpen={searching}
            renderBranch={({ ref: branch, name }, depth) => (
              <BranchMenu key={branch.fullName} repo={repoPath} branch={branch}>
                <Item
                  {...draggableRef(branch)}
                  label={name}
                  highlight={words}
                  depth={depth}
                  selected={view.selectedSha === branch.sha}
                  onClick={() => select(branch.sha)}
                  onDoubleClick={() =>
                    // Say so rather than do nothing, which looks like a missed click.
                    branch.isHead
                      ? toast.info(`${branch.name} is already checked out`)
                      : void checkoutBranch(repoPath, branch.name)
                  }
                  strong={branch.isHead}
                  title={`${branchTooltip(branch, refs)} Double-click to check out; right-click for more.`}
                  trailing={
                    <AheadBehind branch={branch} refs={refs} hasRemotes={remotes.length > 0} />
                  }
                />
              </BranchMenu>
            )}
          />
        </Section>
      )}

      {show(remoteMatches) && (
        <Section
          title="Remotes"
          icon={Cloud}
          count={remoteGroups.length}
          forceOpen={searching}
          action={{ label: 'Add remote', onClick: () => void addRemote(repoPath, remotes) }}
        >
          {remoteGroups.map((group) => {
            const remote = remotes.find((r) => r.name === group.remote)
            return (
              <Section
                key={group.remote}
                title={group.remote}
                nested
                count={group.branches.length}
                forceOpen={searching}
                tooltip={
                  remote
                    ? `${remote.fetchUrl}\nRight-click to fetch, change the URL, rename or remove`
                    : undefined
                }
                wrapHeader={(header) =>
                  remote ? (
                    <RemoteMenu repo={repoPath} remote={remote} remotes={remotes}>
                      {header}
                    </RemoteMenu>
                  ) : (
                    header
                  )
                }
              >
                <BranchTree
                  nodes={buildBranchTree(group.branches, remoteBranchShortName)}
                  depth={1}
                  stateKey={`${repoPath}:remote:${group.remote}`}
                  forceOpen={searching}
                  renderBranch={({ ref: branch, name }, depth) => (
                    <RemoteBranchMenu key={branch.fullName} repo={repoPath} branch={branch}>
                      <Item
                        {...draggableRef(branch)}
                        label={name}
                        highlight={words}
                        depth={depth}
                        selected={view.selectedSha === branch.sha}
                        onClick={() => select(branch.sha)}
                        onDoubleClick={() =>
                          void checkoutChoice(repoPath, checkoutChoiceForRef(branch, refs))
                        }
                        title={`${branch.name}. Double-click to check out as “${remoteBranchShortName(branch)}”; right-click for more.`}
                      />
                    </RemoteBranchMenu>
                  )}
                />
              </Section>
            )
          })}
        </Section>
      )}

      {show(worktrees.length) && (
        <Section
          title="Worktrees"
          icon={FolderTree}
          count={worktrees.length}
          defaultOpen={allWorktrees.length > 1}
          forceOpen={searching}
          action={{ label: 'New worktree', onClick: () => void addWorktree(repoPath) }}
        >
          {worktrees.map((worktree) => {
            const isThis = samePath(worktree.path, repoPath)
            return (
              <WorktreeMenu key={worktree.path} repo={repoPath} worktree={worktree}>
                <Item
                  label={worktree.path.split(/[\\/]/).pop() ?? worktree.path}
                  highlight={words}
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
      )}

      {show(tags.length) && (
        <Section
          title="Tags"
          icon={Tag}
          count={tags.length}
          defaultOpen={false}
          forceOpen={searching}
        >
          {tags.map((tag) => (
            <TagMenu key={tag.fullName} repo={repoPath} tag={tag}>
              <Item
                label={tag.name}
                highlight={words}
                selected={view.selectedSha === tag.sha}
                onClick={() => select(tag.sha)}
              />
            </TagMenu>
          ))}
        </Section>
      )}

      {show(stashes.length) && (
        <Section
          title="Stashes"
          icon={Archive}
          count={stashes.length}
          defaultOpen={false}
          forceOpen={searching}
        >
          {stashes.map((stash) => (
            <StashMenu key={stash.sha} repo={repoPath} stash={stash}>
              <Item
                label={stash.message}
                highlight={words}
                title={`${stash.name}: ${stash.message}. Right-click to apply or delete.`}
                selected={view.selectedSha === stash.sha}
                onClick={() => select(stash.sha, false)}
              />
            </StashMenu>
          ))}
        </Section>
      )}

      {/* Submodules, LFS and plugin panels aren't searched; hide them meanwhile. */}
      {!searching && (
        <>
          <SubmodulesSection repoPath={repoPath} />
          <LfsSection repoPath={repoPath} />
          <PluginPanels repoPath={repoPath} />
        </>
      )}
    </nav>
  )
}

/** First sentence of a local branch's hover text: where it is on the remote. */
function branchTooltip(branch: Ref, refs: Ref[]): string {
  const state = branchRemoteState(branch, refs)
  if (state === 'tracking') return `Tracking ${branch.upstream}.`
  return `${REMOTE_STATE_TEXT[state].title}.`
}

/**
 * "↑2 ↓1" next to a branch that differs from its upstream, or a marker for
 * one that isn't on a remote ("local", "gone"...).
 */
function AheadBehind(props: { branch: Ref; refs: Ref[]; hasRemotes: boolean }) {
  const { branch } = props
  const state = branchRemoteState(branch, props.refs)
  // With no remotes at all, every branch is local; marking them all is just noise.
  if (state === 'local-only' && !props.hasRemotes) return null
  if (state !== 'tracking') {
    const text = REMOTE_STATE_TEXT[state]
    return (
      <span
        className="ml-auto shrink-0 text-xs text-muted-foreground"
        title={text.title}
        data-remote-state={state}
      >
        {text.label}
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

/** The search box at the top of the sidebar, kept in view while the list scrolls. */
function SidebarSearch(props: {
  value: string
  onChange: (value: string) => void
  onEnter: () => void
}) {
  const shortcut = shortcutLabel('sidebar.search')
  return (
    <div className="sticky top-0 z-10 bg-sidebar px-2 pt-2 pb-2">
      <div className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 focus-within:ring-2 focus-within:ring-ring/50">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') props.onEnter()
            if (event.key === 'Escape') props.onChange('')
          }}
          placeholder="Find branches, tags…"
          title={`Find branches, remote branches, tags, stashes and worktrees${shortcut ? ` (${shortcut})` : ''}`}
          aria-label="Find branches, tags and stashes"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {props.value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => props.onChange('')}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
