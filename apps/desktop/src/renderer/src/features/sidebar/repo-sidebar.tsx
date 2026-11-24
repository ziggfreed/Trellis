/**
 * The left sidebar of a repository: local branches, remotes, tags and
 * stashes. Clicking an item selects its commit in the history.
 *
 * Each section can be collapsed; the open/closed state is kept per section
 * name for the session. Right-click any item for actions (check out, merge,
 * delete...); double-click a branch to check it out.
 */
import { useState } from 'react'
import { Archive, ChevronRight, Cloud, GitBranch, Tag, type LucideIcon } from 'lucide-react'
import type { Ref } from '@shared/ipc'
import { cn } from '@/lib/utils'
import { useRefs, useRemotes, useStashes } from '@/features/repos/use-repo-data'
import { useRepoView } from '@/features/repo-view/repo-view-store'
import { BranchMenu, RemoteBranchMenu, StashMenu, TagMenu } from '@/features/repo-actions/menus'
import { checkoutBranch } from '@/features/repo-actions/actions'
import { draggableRef } from '@/features/drag-drop/drop-menu'
import { groupRemoteBranches, localBranches, remoteBranchShortName, sortedTags } from './group-refs'

export function RepoSidebar({ repoPath }: { repoPath: string }) {
  const refs = useRefs(repoPath).data ?? []
  const remotes = useRemotes(repoPath).data ?? []
  const stashes = useStashes(repoPath).data ?? []
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
    </nav>
  )
}

function Section(props: {
  title: string
  icon?: LucideIcon
  count: number
  nested?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  const Icon = props.icon
  return (
    <div className={props.nested ? '' : 'mb-2'}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-sidebar-accent',
          props.nested
            ? 'pl-5 text-sm'
            : 'text-xs font-medium tracking-wide text-muted-foreground uppercase',
        )}
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
        />
        {Icon && <Icon className="size-3.5 shrink-0" />}
        <span className="truncate">{props.title}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground">{props.count}</span>
      </button>
      {open && (
        <div>
          {props.count === 0 && !props.nested ? (
            <p className="px-8 py-0.5 text-xs text-muted-foreground/70 italic">None</p>
          ) : (
            props.children
          )}
        </div>
      )}
    </div>
  )
}

interface ItemProps extends React.ComponentProps<'button'> {
  label: string
  selected: boolean
  strong?: boolean
  indent?: boolean
  trailing?: React.ReactNode
}

/**
 * One row in the sidebar. Extra props (event handlers, ref) are passed to the
 * button, which lets context menus wrap it.
 */
function Item({ label, selected, strong, indent, trailing, title, className, ...rest }: ItemProps) {
  return (
    <button
      type="button"
      title={title ?? label}
      {...rest}
      className={cn(
        'flex w-full items-center gap-2 py-1 pr-2 text-left hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
        indent ? 'pl-12' : 'pl-8',
        selected && 'bg-sidebar-accent',
        className,
      )}
    >
      {strong && (
        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-label="Current branch" />
      )}
      <span className={cn('truncate', strong && 'font-semibold')}>{label}</span>
      {trailing}
    </button>
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
