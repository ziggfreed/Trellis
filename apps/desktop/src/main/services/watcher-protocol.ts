/**
 * Messages between the main process and the file watcher process
 * (watcher-process.ts). Kept in one place so both sides agree.
 */

/** Main -> watcher: watch exactly these repository folders. */
export interface SetWatchedMessage {
  type: 'set'
  paths: string[]
}

/** Watcher -> main: files changed in a repository (paths relative to it, with forward slashes). */
export interface ChangesMessage {
  type: 'changes'
  repoPath: string
  paths: string[]
}

/** Watcher -> main: watching a repository failed. */
export interface WatchErrorMessage {
  type: 'error'
  repoPath: string
  message: string
}

/**
 * Watcher -> main: a repository is now being watched. Changes made while
 * watching was starting weren't seen, so main refreshes once.
 */
export interface ReadyMessage {
  type: 'ready'
  repoPath: string
}

export type WatcherMessage = ChangesMessage | WatchErrorMessage | ReadyMessage
