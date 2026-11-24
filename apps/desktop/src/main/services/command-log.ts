/**
 * Keeps a log of recent git commands for the "Git log" panel, so users can
 * see exactly what Trellis ran (and learn git along the way).
 *
 * Every command reported by `onGitCommand` (packages/git) is stored in a
 * ring buffer of MAX_ENTRIES and passed to `onEntry` (which sends it to the UI).
 */
import { onGitCommand } from '@trellis/git'
import type { GitCommandEntry } from '@shared/ipc'

const MAX_ENTRIES = 500

/**
 * Commands (first argument) that only read from the repository. The panel
 * hides them by default because the app runs them constantly.
 */
const READ_ONLY = new Set([
  '--version',
  'status',
  'log',
  'show',
  'diff',
  'diff-tree',
  'rev-parse',
  'rev-list',
  'for-each-ref',
  'cat-file',
  'symbolic-ref',
  'ls-files',
  'check-ref-format',
])

/** Is this a command that only reads? `args` exclude the global `-c` options. */
export function isReadOnlyCommand(args: readonly string[]): boolean {
  const [command, sub] = args
  if (command === undefined) return true
  if (READ_ONLY.has(command)) return true
  if (command === 'stash') return sub === 'list'
  if (command === 'remote') return sub === '-v' || sub === undefined
  if (command === 'config') return args.includes('--get')
  if (command === 'credential') return true
  return false
}

export class CommandLog {
  private entries: GitCommandEntry[] = []
  private nextId = 1
  private readonly unsubscribe: () => void

  constructor(onEntry: (entry: GitCommandEntry) => void) {
    this.unsubscribe = onGitCommand((event) => {
      const entry: GitCommandEntry = {
        id: this.nextId++,
        time: Date.now(),
        cwd: event.cwd,
        args: [...event.args],
        exitCode: event.exitCode,
        durationMs: event.durationMs,
        readOnly: isReadOnlyCommand(event.args),
      }
      this.entries.push(entry)
      if (this.entries.length > MAX_ENTRIES) this.entries.shift()
      onEntry(entry)
    })
  }

  list(): GitCommandEntry[] {
    return [...this.entries]
  }

  dispose(): void {
    this.unsubscribe()
  }
}
