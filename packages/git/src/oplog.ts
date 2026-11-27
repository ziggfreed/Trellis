/**
 * The operation log: undo and redo for changes made through Trellis.
 *
 * Before each operation (commit, checkout, discard, merge...) we take a
 * snapshot (snapshot.ts), and right after it we note where HEAD and the
 * branches ended up. Undo puts things back to the "before" snapshot; redo
 * goes forward again.
 *
 * SAFETY: undo only moves the branches and tags that the operation itself
 * changed, and only if they haven't been changed again since (for example
 * by a commit made in a terminal). Otherwise it refuses rather than throw
 * away someone's work. The index and files are restored from the snapshot;
 * whatever was there before the undo is saved, so redo can bring it back.
 *
 * The log is stored as JSON at .git/trellis/oplog.json (per worktree), so it
 * survives restarts and other git tools never see it. Only the last
 * MAX_ENTRIES operations are kept. The saved trees are ordinary git objects;
 * `git gc` may delete them after a couple of weeks, which only affects very
 * old undo entries.
 *
 * Operations in progress (an unfinished merge or rebase) aren't recorded,
 * because their state can't be snapshotted reliably; undoing the operation
 * that started them aborts them instead.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { GitError } from './run-git'
import { gitPath } from './git-paths'
import { getRepoOperation } from './repo-state'
import { createSnapshot, restoreSnapshot } from './snapshot'
import type { Snapshot, SnapshotHead, UndoState } from './types'

const MAX_ENTRIES = 50

/** Where HEAD and the refs pointed right after an operation. */
interface RefState {
  head: SnapshotHead
  refs: Record<string, string>
}

interface OplogEntry {
  label: string
  time: number
  before: Snapshot
  applied: RefState
  /** State just before the last undo, for redo. */
  undone: Snapshot | null
}

interface OplogFile {
  version: 1
  entries: OplogEntry[]
  /** How many entries are currently applied: entries after this can be redone. */
  position: number
}

function logPath(repoPath: string): Promise<string> {
  return gitPath(repoPath, 'trellis/oplog.json')
}

async function load(repoPath: string): Promise<OplogFile> {
  try {
    const file = JSON.parse(await readFile(await logPath(repoPath), 'utf8')) as OplogFile
    if (file.version === 1 && Array.isArray(file.entries)) return file
  } catch {
    // Missing or unreadable: start a new log.
  }
  return { version: 1, entries: [], position: 0 }
}

async function save(repoPath: string, log: OplogFile): Promise<void> {
  const path = await logPath(repoPath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(log))
}

const sameHead = (a: SnapshotHead, b: SnapshotHead) =>
  a.kind === b.kind &&
  (a.kind === 'branch' ? a.ref === (b as typeof a).ref : a.sha === (b as typeof a).sha)

/**
 * Work out the ref changes needed to go from state `from` to state `to`,
 * applied on top of `current`. Returns the target refs and HEAD, or throws
 * if a ref that needs moving was changed by something else in the meantime.
 *
 * Exported for tests.
 */
export function planRefChanges(
  current: RefState,
  from: RefState,
  to: RefState,
): { refs: Record<string, string>; head: SnapshotHead } {
  const refs = { ...current.refs }
  const names = new Set([...Object.keys(from.refs), ...Object.keys(to.refs)])
  for (const name of names) {
    if (from.refs[name] === to.refs[name]) continue // this operation didn't touch it
    if (current.refs[name] !== from.refs[name]) {
      const short = name.replace(/^refs\/(heads|tags)\//, '')
      throw new GitError(`Can't undo safely: ${short} has changed since then.`, ['undo'])
    }
    if (to.refs[name] === undefined) delete refs[name]
    else refs[name] = to.refs[name]!
  }
  const head = sameHead(from.head, to.head) ? current.head : to.head
  return { refs, head }
}

/**
 * Run `operation`, recording it so it can be undone.
 * `worktree`: true if the operation may change files (checkout, discard,
 * merge...), so the files are snapshotted too. Not needed for operations
 * that only change the index or refs (stage, commit, create branch...).
 * `indexOnly`: true if the operation can only change the index (staging),
 * which saves re-reading HEAD and the branches afterwards.
 */
export async function recordOperation<T>(
  repoPath: string,
  label: string,
  options: { worktree: boolean; indexOnly?: boolean },
  operation: () => Promise<T>,
): Promise<T> {
  if ((await getRepoOperation(repoPath)) !== null) return operation()
  const before = await createSnapshot(repoPath, { worktree: options.worktree })
  const result = await operation()
  // Afterwards only HEAD and the branches are recorded (to check nothing
  // else moved them before an undo). An operation that only changes the
  // index (staging, unstaging) can't move them, so skip reading them again:
  // four fewer git commands each time you stage a file.
  const after = options.indexOnly ? before : await createSnapshot(repoPath, { worktree: false })
  const log = await load(repoPath)
  log.entries = log.entries.slice(0, log.position) // a new operation discards the redo history
  log.entries.push({
    label,
    time: Date.now(),
    before,
    applied: { head: after.head, refs: after.refs },
    undone: null,
  })
  log.entries = log.entries.slice(-MAX_ENTRIES)
  log.position = log.entries.length
  await save(repoPath, log)
  return result
}

export async function getUndoState(repoPath: string): Promise<UndoState> {
  const log = await load(repoPath)
  const undo = log.entries[log.position - 1]
  const redo = log.entries[log.position]
  return {
    undo: undo ? { label: undo.label, time: undo.time } : null,
    redo: redo?.undone ? { label: redo.label, time: redo.time } : null,
  }
}

/** Undo the last recorded operation. Returns its label, or null if there was nothing to undo. */
export async function undo(repoPath: string): Promise<string | null> {
  const log = await load(repoPath)
  const entry = log.entries[log.position - 1]
  if (!entry) return null
  const current = await createSnapshot(repoPath, { worktree: entry.before.worktreeTree !== null })
  const { refs, head } = planRefChanges(current, entry.applied, entry.before)
  await restoreSnapshot(repoPath, { ...entry.before, refs, head }, current)
  entry.undone = current
  log.position--
  await save(repoPath, log)
  return entry.label
}

/** Redo the last undone operation. Returns its label, or null if there was nothing to redo. */
export async function redo(repoPath: string): Promise<string | null> {
  const log = await load(repoPath)
  const entry = log.entries[log.position]
  if (!entry?.undone) return null
  const target = entry.undone
  const current = await createSnapshot(repoPath, { worktree: target.worktreeTree !== null })
  const { refs, head } = planRefChanges(current, entry.before, entry.applied)
  await restoreSnapshot(repoPath, { ...target, refs, head }, current)
  log.position++
  await save(repoPath, log)
  return entry.label
}
