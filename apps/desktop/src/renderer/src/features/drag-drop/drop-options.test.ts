import { describe, expect, it } from 'vitest'
import type { Ref } from '@shared/ipc'
import { dropOptions } from './drop-options'

function ref(type: Ref['type'], name: string, sha: string): Ref {
  return {
    fullName: `${type}/${name}`,
    name,
    type,
    sha,
    isHead: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    upstreamGone: false,
  }
}
const labels = (actions: { label: string }[]) => actions.map((a) => a.label)

describe('dropOptions', () => {
  const main = ref('branch', 'main', 'm1')
  const feature = ref('branch', 'feature', 'f1')

  it('dropping a branch on the current branch offers merge and rebase', () => {
    expect(labels(dropOptions(feature, { sha: 'm1', ref: main }, 'main'))).toEqual([
      'Merge feature into main',
      'Rebase main onto feature',
      'Move feature to main',
      'Compare feature with main',
    ])
  })

  it('dragging the current branch offers rebase onto the target', () => {
    expect(labels(dropOptions(main, { sha: 'f1', ref: feature }, 'main'))).toEqual([
      'Rebase main onto feature',
      'Merge feature into main',
      'Compare main with feature',
    ])
    // Onto a plain commit: rebase, but nothing to merge.
    expect(labels(dropOptions(main, { sha: 'abcdef123' }, 'main'))).toEqual([
      'Rebase main onto abcdef1',
      'Compare main with abcdef1',
    ])
  })

  it('other branches can be moved', () => {
    const other = ref('branch', 'other', 'o1')
    expect(labels(dropOptions(other, { sha: 'abcdef123' }, 'main'))).toEqual([
      'Move other to abcdef1',
      'Compare other with abcdef1',
    ])
  })

  it('remote branches can be merged into the current branch but not moved', () => {
    const remote = ref('remote-branch', 'origin/feature', 'r1')
    expect(labels(dropOptions(remote, { sha: 'm1', ref: main }, 'main'))).toEqual([
      'Merge origin/feature into main',
      'Rebase main onto origin/feature',
      'Compare origin/feature with main',
    ])
  })

  it('offers nothing for dropping onto itself or dragging a tag', () => {
    expect(dropOptions(feature, { sha: 'f1', ref: feature }, 'main')).toEqual([])
    expect(dropOptions(feature, { sha: 'f1' }, 'main')).toEqual([])
    expect(dropOptions(ref('tag', 'v1', 't'), { sha: 'm1', ref: main }, 'main')).toEqual([])
  })
})
