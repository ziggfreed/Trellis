/**
 * What can happen when a branch is dragged onto another branch or commit.
 * Pure, so the rules are easy to read and test.
 *
 * Git merges and rebases always act on the checked-out branch, so the
 * choices depend on which side (if either) is the current branch.
 */
import type { Ref } from '@shared/ipc'

export type DropAction =
  | { kind: 'merge'; ref: string; label: string }
  | { kind: 'rebase'; onto: string; label: string }
  | { kind: 'move'; branch: string; target: string; label: string }
  | { kind: 'compare'; head: string; base: string; label: string }

/** What was dropped on: a branch or tag label, or a commit row. */
export interface DropTarget {
  sha: string
  ref?: Ref
}

/**
 * @param source  the dragged branch (local or remote)
 * @param target  where it was dropped
 * @param current the checked-out branch's name, or null if HEAD is detached
 */
export function dropOptions(source: Ref, target: DropTarget, current: string | null): DropAction[] {
  if (source.type === 'tag') return []
  const targetName = target.ref?.name ?? target.sha.slice(0, 7)
  const targetRef = target.ref?.name ?? target.sha
  if (target.ref?.fullName === source.fullName || (!target.ref && target.sha === source.sha))
    return []

  const actions: DropAction[] = []
  const targetIsCurrent = target.ref?.type === 'branch' && target.ref.name === current
  const sourceIsCurrent = source.type === 'branch' && source.name === current

  if (targetIsCurrent) {
    actions.push({ kind: 'merge', ref: source.name, label: `Merge ${source.name} into ${current}` })
    actions.push({
      kind: 'rebase',
      onto: source.name,
      label: `Rebase ${current} onto ${source.name}`,
    })
  } else if (sourceIsCurrent) {
    actions.push({ kind: 'rebase', onto: targetRef, label: `Rebase ${current} onto ${targetName}` })
    if (target.ref && target.ref.type !== 'tag') {
      actions.push({
        kind: 'merge',
        ref: target.ref.name,
        label: `Merge ${targetName} into ${current}`,
      })
    }
  }
  // Any local branch other than the current one can simply be pointed somewhere else.
  if (source.type === 'branch' && !sourceIsCurrent) {
    actions.push({
      kind: 'move',
      branch: source.name,
      target: target.sha,
      label: `Move ${source.name} to ${targetName}`,
    })
  }
  actions.push({
    kind: 'compare',
    head: source.name,
    base: targetRef,
    label: `Compare ${source.name} with ${targetName}`,
  })
  return actions
}
