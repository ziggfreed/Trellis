/**
 * Turns a finished git command into the operation plugins hear about via
 * `trellis.repos.onDidRunOperation` (e.g. `git commit -m x` → "commit").
 *
 * Only commands that change a repository count. Read-only and plumbing
 * commands (status, log, update-ref...) return null, so plugins aren't
 * woken for the many commands Trellis runs just to draw the screen.
 */
import type { OperationEvent } from '@trellis/plugin-api'

type Kind = OperationEvent['kind']

const SIMPLE: Record<string, Kind> = {
  commit: 'commit',
  checkout: 'checkout',
  switch: 'checkout',
  fetch: 'fetch',
  pull: 'pull',
  push: 'push',
  merge: 'merge',
  rebase: 'rebase',
  reset: 'reset',
  'cherry-pick': 'cherry-pick',
  revert: 'revert',
}

/**
 * The operation `args` (without git's global `-c` options) performed, or
 * null if it's not one plugins are told about.
 */
export function operationKind(args: readonly string[]): Kind | null {
  const [command, ...rest] = args
  if (command === undefined) return null
  if (command in SIMPLE) {
    // `checkout -- file` / `checkout HEAD -- file` restore files, not branches.
    if (command === 'checkout' && rest.includes('--')) return null
    return SIMPLE[command]!
  }
  // `branch` and `tag` with no arguments (or listing flags) only list.
  const listing = rest.length === 0 || rest.some((a) => ['--list', '-l', '-a', '-r'].includes(a))
  if (command === 'branch') return listing || rest.includes('--show-current') ? null : 'branch'
  if (command === 'tag') return listing ? null : 'tag'
  if (command === 'stash') {
    const sub = rest[0]
    return sub === 'list' || sub === 'show' ? null : 'stash'
  }
  return null
}
