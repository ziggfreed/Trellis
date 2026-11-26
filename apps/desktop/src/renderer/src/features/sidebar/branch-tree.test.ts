import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import { buildBranchTree, type BranchTreeNode } from './branch-tree'

const branch = (name: string, isHead = false): Ref =>
  ({ name, fullName: `refs/heads/${name}`, type: 'branch', sha: 'abc', isHead }) as Ref

/** A readable outline of the tree: folders end in "/", with their count. */
function outline(nodes: BranchTreeNode[], indent = ''): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder'
      ? [`${indent}${node.name}/ (${node.count})`, ...outline(node.children, `${indent}  `)]
      : [`${indent}${node.name}`],
  )
}

describe('buildBranchTree', () => {
  it('puts branches that share a path in folders, nested as deep as needed', () => {
    const tree = buildBranchTree(
      ['main', 'feature/login', 'feature/search', 'team/ann/fix', 'team/ann/docs', 'team/ben'].map(
        (n) => branch(n),
      ),
      (r) => r.name,
    )
    expect(outline(tree)).toEqual([
      'feature/ (2)',
      '  login',
      '  search',
      'team/ (3)',
      '  ann/ (2)',
      '    docs',
      '    fix',
      '  ben',
      'main',
    ])
  })

  it('keeps folder paths and marks the folders holding the checked-out branch', () => {
    const tree = buildBranchTree([branch('team/ann/fix', true), branch('other')], (r) => r.name)
    const team = tree[0]!
    expect(team).toMatchObject({ kind: 'folder', path: 'team', containsHead: true })
    const ann = team.kind === 'folder' ? team.children[0] : undefined
    expect(ann).toMatchObject({ kind: 'folder', path: 'team/ann', containsHead: true })
    expect(tree[1]).toMatchObject({ kind: 'branch', name: 'other' })
  })

  it('lists the checked-out branch first, then the rest by name, numbers in order', () => {
    const tree = buildBranchTree(
      ['fix-10', 'Fix-2', 'fix-9', 'main'].map((n) => branch(n, n === 'main')),
      (r) => r.name,
    )
    expect(outline(tree)).toEqual(['main', 'Fix-2', 'fix-9', 'fix-10'])
  })

  it('splits remote branches on the name without the remote', () => {
    const remote = { ...branch('origin/feature/x'), type: 'remote-branch', remote: 'origin' } as Ref
    const tree = buildBranchTree([remote], (r) => r.name.slice('origin/'.length))
    expect(outline(tree)).toEqual(['feature/ (1)', '  x'])
  })
})
