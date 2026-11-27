/**
 * Shows a branch folder tree (branch-tree.ts) in the sidebar: each folder is
 * a row that expands to show its branches and subfolders.
 *
 * Folders start open only if they hold the checked-out branch, so a long
 * list of feature branches stays tidy. Whether each folder is open is
 * remembered for the session (per repository and section), so it survives
 * switching tabs.
 */
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { create } from 'zustand'
import { cn } from '@/lib/utils'
import type { BranchLeafNode, BranchTreeNode } from './branch-tree'
import { itemIndent } from './sidebar-parts'

interface FolderStore {
  /** Folder key -> open. Folders not listed use their default. */
  open: Record<string, boolean>
  setOpen: (key: string, open: boolean) => void
}

const useFolderStore = create<FolderStore>((set) => ({
  open: {},
  setOpen: (key, open) => set((s) => ({ open: { ...s.open, [key]: open } })),
}))

export function BranchTree(props: {
  nodes: BranchTreeNode[]
  /** Depth of these nodes (0 = directly under the section heading). */
  depth: number
  /** Identifies this tree for remembering open folders, e.g. "<repo>:local". */
  stateKey: string
  /** Render one branch row; give the row `depth` for its indentation. */
  renderBranch: (leaf: BranchLeafNode, depth: number) => React.ReactNode
  /** Open every folder (while searching, so matches inside folders show). */
  forceOpen?: boolean
}) {
  const openFolders = useFolderStore((s) => s.open)
  const setOpen = useFolderStore((s) => s.setOpen)
  return (
    <>
      {props.nodes.map((node) => {
        if (node.kind === 'branch') return props.renderBranch(node, props.depth)
        const key = `${props.stateKey}:${node.path}`
        const open = props.forceOpen || (openFolders[key] ?? node.containsHead)
        const Icon = open ? FolderOpen : Folder
        return (
          <div key={key} role="group" aria-label={`${node.path} folder`}>
            <button
              type="button"
              aria-expanded={open}
              title={`${node.path}/ (${node.count} ${node.count === 1 ? 'branch' : 'branches'})`}
              onClick={() => setOpen(key, !open)}
              // Start the chevron a little left of where branch names at this
              // depth start, so the folder icon lines up with them.
              style={{ paddingLeft: itemIndent(props.depth) - 18 }}
              className="flex w-full items-center gap-1 py-1 pr-2 text-left hover:bg-sidebar-accent"
            >
              <ChevronRight
                className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
              />
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="ml-1 truncate">{node.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{node.count}</span>
            </button>
            {open && (
              <BranchTree
                nodes={node.children}
                depth={props.depth + 1}
                stateKey={props.stateKey}
                renderBranch={props.renderBranch}
                forceOpen={props.forceOpen}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
