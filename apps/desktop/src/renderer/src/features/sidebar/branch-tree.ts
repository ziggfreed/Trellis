/**
 * Turns branch names into a folder tree for the sidebar: branches that share
 * a path prefix (`feature/login`, `feature/search`) are shown inside a
 * `feature` folder, and folders can nest (`team/ann/fix` → team › ann › fix).
 *
 * Pure, so it's unit-tested (branch-tree.test.ts); branch-tree-view.tsx
 * renders it.
 */
import type { Ref } from '@shared/ipc'

export interface BranchFolderNode {
  kind: 'folder'
  /** This folder's own name, e.g. "ann". */
  name: string
  /** Full path of the folder, e.g. "team/ann" (unique within one tree). */
  path: string
  children: BranchTreeNode[]
  /** Number of branches inside, at any depth. */
  count: number
  /** True if the checked-out branch is inside, so the folder starts open. */
  containsHead: boolean
}

export interface BranchLeafNode {
  kind: 'branch'
  /** The last part of the name, e.g. "fix" for "team/ann/fix". */
  name: string
  ref: Ref
}

export type BranchTreeNode = BranchFolderNode | BranchLeafNode

/**
 * Build the tree. `nameOf` gives the name to split on "/" (for remote
 * branches, the name without the remote, so "origin/feature/x" is placed at
 * feature › x under the origin heading).
 *
 * At each level, folders come first, then branches with the checked-out one
 * first; both in alphabetical order, ignoring case, with numbers in numeric
 * order (so fix-10 comes after fix-9).
 */
export function buildBranchTree(refs: Ref[], nameOf: (ref: Ref) => string): BranchTreeNode[] {
  const root: BranchFolderNode = {
    kind: 'folder',
    name: '',
    path: '',
    children: [],
    count: 0,
    containsHead: false,
  }
  for (const ref of refs) {
    const parts = nameOf(ref).split('/').filter(Boolean)
    if (parts.length === 0) continue
    let folder = root
    folder.count++
    if (ref.isHead) folder.containsHead = true
    for (const part of parts.slice(0, -1)) {
      let next = folder.children.find(
        (c): c is BranchFolderNode => c.kind === 'folder' && c.name === part,
      )
      if (!next) {
        next = {
          kind: 'folder',
          name: part,
          path: folder.path ? `${folder.path}/${part}` : part,
          children: [],
          count: 0,
          containsHead: false,
        }
        folder.children.push(next)
      }
      folder = next
      folder.count++
      if (ref.isHead) folder.containsHead = true
    }
    folder.children.push({ kind: 'branch', name: parts.at(-1)!, ref })
  }
  sortTree(root)
  return root.children
}

const byName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b)

function rank(node: BranchTreeNode): number {
  if (node.kind === 'folder') return 0
  return node.ref.isHead ? 1 : 2
}

function sortTree(folder: BranchFolderNode): void {
  folder.children.sort((a, b) => rank(a) - rank(b) || byName(a.name, b.name))
  for (const child of folder.children) if (child.kind === 'folder') sortTree(child)
}
