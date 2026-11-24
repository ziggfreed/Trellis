/**
 * The file watcher, running in its own process (an Electron utilityProcess).
 *
 * WHY A SEPARATE PROCESS: @parcel/watcher is native code. On Windows,
 * starting to watch a folder was found to block the calling thread for
 * several seconds, which froze the whole app (every git command and UI
 * request waited). Running it here means a slow or crashing watcher can
 * never freeze or crash the main process.
 *
 * This process only watches and forwards changed paths. Deciding what they
 * mean and debouncing happen in the main process (repo-watcher.ts).
 */
import { relative } from 'node:path'
import watcher, { type AsyncSubscription } from '@parcel/watcher'
import type { SetWatchedMessage, WatcherMessage } from './watcher-protocol'

/**
 * Folders we never watch. Changes inside them are frequent and either don't
 * matter to git (objects are covered by ref changes) or are almost always
 * ignored by .gitignore (dependency folders).
 */
const IGNORE = ['.git/objects', '.git/logs', 'node_modules']

const subscriptions = new Map<string, Promise<AsyncSubscription | null>>()

function send(message: WatcherMessage) {
  process.parentPort.postMessage(message)
}

function watch(repoPath: string) {
  const subscription = watcher
    .subscribe(
      repoPath,
      (error, events) => {
        if (error) return // e.g. the folder was deleted; nothing useful to do
        // Forward slashes so classification works the same on Windows.
        const paths = events.map((event) => relative(repoPath, event.path).replaceAll('\\', '/'))
        if (paths.length) send({ type: 'changes', repoPath, paths })
      },
      { ignore: IGNORE },
    )
    .then((sub) => {
      send({ type: 'ready', repoPath })
      return sub
    })
    .catch((error: unknown) => {
      send({
        type: 'error',
        repoPath,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })
  subscriptions.set(repoPath, subscription)
}

function unwatch(repoPath: string) {
  const subscription = subscriptions.get(repoPath)
  subscriptions.delete(repoPath)
  void subscription?.then((sub) => sub?.unsubscribe())
}

process.parentPort.on('message', (event: { data: SetWatchedMessage }) => {
  const message = event.data
  if (message.type !== 'set') return
  const wanted = new Set(message.paths)
  for (const path of subscriptions.keys()) if (!wanted.has(path)) unwatch(path)
  for (const path of wanted) if (!subscriptions.has(path)) watch(path)
})
