/**
 * Watches open repositories for file changes and reports them, so the UI
 * refreshes when you edit files or run git in a terminal.
 *
 * The watching itself happens in a separate process (watcher-process.ts,
 * using @parcel/watcher, the same native watcher VS Code uses) so it can
 * never block or crash the main process. This class starts that process,
 * tells it which folders to watch, and turns the changed paths it reports
 * into "refresh" events.
 *
 * Events are debounced: a single `git checkout` can touch thousands of files,
 * so we wait until things are quiet for DEBOUNCE_MS before reporting once.
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import watcherProcessPath from './watcher-process?modulePath'
import { classifyChange, mergeScopes, type ChangeScope } from './classify-change'
import type { SetWatchedMessage, WatcherMessage } from './watcher-protocol'

const DEBOUNCE_MS = 300
/** If the watcher process dies, wait this long before starting a new one. */
const RESTART_DELAY_MS = 2000

type ChangeListener = (repoPath: string, scope: 'status' | 'all') => void

interface PendingChanges {
  scope: ChangeScope
  timer: NodeJS.Timeout | null
}

export class RepoWatcher {
  private child: UtilityProcess | null = null
  private watched: string[] = []
  private readonly pending = new Map<string, PendingChanges>()
  private disposed = false

  constructor(private readonly onChange: ChangeListener) {}

  /** Watch exactly these repositories: start new ones, stop removed ones. */
  setWatched(paths: string[]): void {
    this.watched = [...paths]
    for (const path of this.pending.keys()) {
      if (!paths.includes(path)) this.clearPending(path)
    }
    if (paths.length === 0 && !this.child) return
    this.send({ type: 'set', paths: this.watched })
  }

  /** Stop watching everything (call before the app quits). */
  dispose(): void {
    this.disposed = true
    for (const path of [...this.pending.keys()]) this.clearPending(path)
    this.child?.kill()
    this.child = null
  }

  private send(message: SetWatchedMessage): void {
    if (this.disposed) return
    if (!this.child) this.start()
    this.child?.postMessage(message)
  }

  private start(): void {
    const child = utilityProcess.fork(watcherProcessPath, [], {
      serviceName: 'Trellis file watcher',
    })
    child.on('message', (message: WatcherMessage) => this.handle(message))
    child.on('exit', () => {
      if (this.child !== child) return
      this.child = null
      // Watching is a convenience: the app still works (and refreshes on
      // window focus) without it. Try again shortly.
      if (!this.disposed && this.watched.length) {
        setTimeout(() => this.send({ type: 'set', paths: this.watched }), RESTART_DELAY_MS)
      }
    })
    this.child = child
  }

  private handle(message: WatcherMessage): void {
    if (message.type === 'error') {
      console.warn(`Could not watch ${message.repoPath}: ${message.message}`)
      return
    }
    if (!this.watched.includes(message.repoPath)) return
    if (message.type === 'ready') {
      // Starting to watch can take seconds (notably on Windows); refresh in
      // case anything changed in the meantime.
      this.onChange(message.repoPath, 'all')
      return
    }
    let scope: ChangeScope = null
    for (const path of message.paths) scope = mergeScopes(scope, classifyChange(path))
    if (scope) this.schedule(message.repoPath, scope)
  }

  private schedule(repoPath: string, scope: ChangeScope): void {
    const entry = this.pending.get(repoPath) ?? { scope: null, timer: null }
    entry.scope = mergeScopes(entry.scope, scope)
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      this.pending.delete(repoPath)
      if (entry.scope) this.onChange(repoPath, entry.scope)
    }, DEBOUNCE_MS)
    this.pending.set(repoPath, entry)
  }

  private clearPending(repoPath: string): void {
    const entry = this.pending.get(repoPath)
    if (entry?.timer) clearTimeout(entry.timer)
    this.pending.delete(repoPath)
  }
}
