/**
 * Decides what a changed file means for the UI, so we refresh only what's
 * needed. Kept separate from the watcher so it can be unit tested.
 */

/**
 * What to refresh after a file changes:
 * - `status`: the working-tree changes list.
 * - `all`: everything (history, branches, tags, stashes and status).
 * - null: nothing, the change doesn't affect anything we show.
 */
export type ChangeScope = 'status' | 'all' | null

/**
 * Classify one changed path, given relative to the repository root with
 * forward slashes, e.g. "src/app.ts" or ".git/refs/heads/main".
 */
export function classifyChange(relativePath: string): ChangeScope {
  if (relativePath !== '.git' && !relativePath.startsWith('.git/')) {
    // An ordinary file in the working tree.
    return 'status'
  }

  const inside = relativePath.slice('.git/'.length)
  // Lock files appear and disappear during every git command; the real file
  // is written when the lock is released, and we react to that instead.
  if (inside.endsWith('.lock')) return null
  // Object storage changes constantly but only matters once a ref points at
  // the new objects, which shows up as a ref change.
  if (inside.startsWith('objects/') || inside.startsWith('logs/')) return null
  // Trellis's own undo log, written after every operation; refreshing for it would be wasted work.
  if (inside.startsWith('trellis/')) return null
  // The index tracks what's staged.
  if (inside === 'index') return 'status'
  // HEAD, refs, packed-refs, stash, MERGE_HEAD, FETCH_HEAD... all affect history or branches.
  return 'all'
}

/** Combine two scopes, keeping the larger one ("all" beats "status" beats null). */
export function mergeScopes(a: ChangeScope, b: ChangeScope): ChangeScope {
  if (a === 'all' || b === 'all') return 'all'
  if (a === 'status' || b === 'status') return 'status'
  return null
}
