/**
 * The IPC contract: every request the UI (renderer) can make to the main
 * process, and every event the main process can push to the UI.
 *
 * HOW TO ADD A NEW IPC CALL (UI asks main for something)
 *   1. Add an entry to `IpcContract` below: `'area:action': { args: [...]; result: ... }`.
 *   2. Add the channel to `channelMap` at the bottom of this file.
 *   3. Implement it in `src/main/ipc/handlers.ts` (TypeScript will complain until you do).
 *   4. Call it from the UI with `api.invoke('area:action', ...args)` (see renderer/src/lib/api.ts).
 *
 * HOW TO ADD A NEW EVENT (main tells the UI something happened)
 *   1. Add an entry to `IpcEvents` and to `eventMap` at the bottom.
 *   2. Send it from main with `sendToAllWindows('area:event', payload)`.
 *   3. Listen in the UI with `api.on('area:event', (payload) => ...)`.
 *
 * Only plain data (objects, arrays, strings, numbers, booleans, null) can cross
 * the IPC boundary. Functions, class instances and Dates do not survive.
 */
import type {
  Commit,
  LogScope,
  CommitDetails,
  DiffTarget,
  FileDiffContents,
  GitInstallation,
  Ref,
  Remote,
  RepoStatus,
  Stash,
} from '@trellis/git/types'

// Re-export the git types the UI uses, so it can import everything from here.
export type * from '@trellis/git/types'

export type ThemePreference = 'light' | 'dark' | 'system'

/** A repository open as a tab. */
export interface RepoTab {
  /** Absolute path of the repository root. Also used as the tab's unique id. */
  path: string
  /** Display name (the folder name). */
  name: string
}

/** Settings saved to disk between launches. */
export interface Settings {
  theme: ThemePreference
  /** Tabs that were open, in order. Restored on the next launch. */
  openTabs: RepoTab[]
  /** Path of the selected tab, or null for the home screen. */
  activeTab: string | null
  /** Recently opened repositories, newest first. */
  recentRepos: RepoTab[]
  /** How the diff viewer shows changes. */
  diffLayout: 'unified' | 'split'
  /** Folder last used as the destination for cloning. */
  lastCloneFolder: string | null
}

export interface AppInfo {
  version: string
  /** Operating system, e.g. 'win32', 'darwin' or 'linux'. */
  platform: string
}

/** Result of asking to open a folder as a repository. */
export type OpenRepoResult =
  { ok: true; repo: RepoTab } | { ok: false; reason: 'not-a-repo' | 'not-found'; path: string }

/** Result of a clone or init. */
export type CreateRepoResult = { ok: true; repo: RepoTab } | { ok: false; message: string }

export interface LogPage {
  commits: Commit[]
  /** False when the end of history has been reached. */
  hasMore: boolean
}

export interface IpcContract {
  'app:getInfo': { args: []; result: AppInfo }
  'git:checkInstallation': { args: []; result: GitInstallation }

  'settings:get': { args: []; result: Settings }
  /** Merge a partial update into the saved settings. Returns the new settings. */
  'settings:update': { args: [patch: Partial<Settings>]; result: Settings }

  /** Show the native "choose folder" dialog. Returns null if cancelled. */
  'dialog:pickFolder': { args: [options?: { title?: string }]; result: string | null }

  /** Check that `path` is (inside) a git repo and return its root. */
  'repo:resolve': { args: [path: string]; result: OpenRepoResult }
  /** Open the repo folder in the system file manager. */
  'repo:showInFolder': { args: [path: string]; result: void }
  /**
   * Tell main which repositories to watch for changes (the open tabs).
   * Main sends `repo:changed` events for them.
   */
  'repo:setWatched': { args: [paths: string[]]; result: void }

  'repo:getStatus': { args: [path: string]; result: RepoStatus }
  'repo:getLog': {
    args: [path: string, page: { skip: number; limit: number; scope: LogScope }]
    result: LogPage
  }
  /** Hashes of commits matching `query` (message, author or hash), newest first. */
  'repo:searchCommits': { args: [path: string, query: string, scope: LogScope]; result: string[] }
  'repo:getRefs': { args: [path: string]; result: Ref[] }
  'repo:getRemotes': { args: [path: string]; result: Remote[] }
  'repo:getStashes': { args: [path: string]; result: Stash[] }
  'repo:getCommit': { args: [path: string, sha: string]; result: CommitDetails }
  'repo:getFileDiff': { args: [path: string, target: DiffTarget]; result: FileDiffContents }

  /**
   * Clone `url` into `targetDir`. Progress arrives as `operation:progress`
   * events tagged with `operationId`; cancel with `operation:cancel`.
   */
  'repo:clone': {
    args: [operationId: string, url: string, targetDir: string]
    result: CreateRepoResult
  }
  /** Create a new repository in `dir`. */
  'repo:init': { args: [dir: string]; result: CreateRepoResult }
  /** Cancel a running long operation (e.g. a clone). */
  'operation:cancel': { args: [operationId: string]; result: void }
}

/** Events pushed from the main process to the UI. */
export interface IpcEvents {
  /**
   * Files in a watched repository changed.
   * - `status`: only working-tree files changed (refresh the changes list).
   * - `all`: git's own data changed too, e.g. a commit, checkout or fetch.
   */
  'repo:changed': { path: string; scope: 'status' | 'all' }
  /** Progress of a long-running operation started by the UI. */
  'operation:progress': { operationId: string; phase: string; percent: number }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']
export type IpcEvent = keyof IpcEvents

/** The API the preload script exposes on `window.trellis`. */
export interface TrellisBridge {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
  /** Listen for an event from main. Returns a function that stops listening. */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
}

/**
 * Runtime lists of allowed channels and events. The preload script refuses
 * anything not listed here. The `Record<..., true>` types make TypeScript fail
 * if a channel is added to the contract but forgotten here.
 */
const channelMap: Record<IpcChannel, true> = {
  'app:getInfo': true,
  'git:checkInstallation': true,
  'settings:get': true,
  'settings:update': true,
  'dialog:pickFolder': true,
  'repo:resolve': true,
  'repo:showInFolder': true,
  'repo:setWatched': true,
  'repo:getStatus': true,
  'repo:getLog': true,
  'repo:searchCommits': true,
  'repo:getRefs': true,
  'repo:getRemotes': true,
  'repo:getStashes': true,
  'repo:getCommit': true,
  'repo:getFileDiff': true,
  'repo:clone': true,
  'repo:init': true,
  'operation:cancel': true,
}
export const IPC_CHANNELS = Object.keys(channelMap) as IpcChannel[]

const eventMap: Record<IpcEvent, true> = {
  'repo:changed': true,
  'operation:progress': true,
}
export const IPC_EVENTS = Object.keys(eventMap) as IpcEvent[]
