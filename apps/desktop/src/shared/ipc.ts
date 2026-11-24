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
  FileContent,
  FileDiffContents,
  GitInstallation,
  Ref,
  Remote,
  MergeResult,
  BlameResult,
  Comparison,
  FileHistoryEntry,
  RebasePlanItem,
  UndoState,
  RepoStatus,
  Stash,
} from '@trellis/git/types'
import type { FilePatch } from '@trellis/git/patch'

// Re-export the git types the UI uses, so it can import everything from here.
export type * from '@trellis/git/types'

export type { FilePatch, Hunk, PatchLine, LineId } from '@trellis/git/patch'

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

/** One git command run by the app, for the command log panel. */
export interface GitCommandEntry {
  id: number
  /** When it finished (Unix time in milliseconds). */
  time: number
  /** Folder it ran in (usually a repository root). */
  cwd: string
  args: string[]
  /** null if git couldn't be started or was stopped. */
  exitCode: number | null
  durationMs: number
  /** True for commands that only read (status, log...), hidden by default. */
  readOnly: boolean
}

/** What to check out. */
export type CheckoutTarget =
  | { kind: 'branch'; name: string }
  /** A remote branch such as "origin/feature", checked out as local branch `localName`. */
  | { kind: 'remote-branch'; name: string; localName: string }
  /** A commit, giving a "detached HEAD". */
  | { kind: 'commit'; sha: string }

export interface PushRequest {
  remote: string
  branch: string
  remoteBranch?: string
  setUpstream?: boolean
  /** Force push "with lease" (only if the remote hasn't changed since our last fetch). */
  force?: boolean
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
  /** Open a file from the repository in its default app (e.g. to resolve conflicts). */
  'repo:openFile': { args: [path: string, file: string]; result: void }
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

  // --- Staging and committing ---------------------------------------------
  'repo:stage': { args: [path: string, files: string[]]; result: void }
  'repo:unstage': { args: [path: string, files: string[]]; result: void }
  /** Throw away working-tree changes. Untracked files are deleted. */
  'repo:discard': {
    args: [path: string, files: { path: string; untracked: boolean }[]]
    result: void
  }
  /** The diff of one file as hunks, for hunk and line staging. */
  'repo:getFilePatch': {
    args: [path: string, file: string, area: 'staged' | 'unstaged' | 'untracked']
    result: FilePatch | null
  }
  /** Apply a partial patch built in the UI with buildPartialPatch. */
  'repo:applyPatch': {
    args: [path: string, patch: string, action: 'stage' | 'unstage' | 'discard']
    result: void
  }
  /** Commit staged changes; returns the new commit's hash. */
  'repo:commit': {
    args: [path: string, message: string, options: { amend: boolean }]
    result: string
  }
  'repo:getHeadMessage': { args: [path: string]; result: string | null }

  // --- Branches and history -------------------------------------------------
  'repo:createBranch': {
    args: [path: string, name: string, options: { startPoint?: string; checkout: boolean }]
    result: void
  }
  'repo:checkout': { args: [path: string, target: CheckoutTarget]; result: void }
  /** Point a (not checked out) branch at another commit. */
  'repo:moveBranch': { args: [path: string, name: string, target: string]; result: void }
  'repo:renameBranch': { args: [path: string, from: string, to: string]; result: void }
  'repo:deleteBranch': { args: [path: string, name: string, force: boolean]; result: void }
  'repo:merge': {
    args: [path: string, ref: string, options: { noFastForward: boolean }]
    result: MergeResult
  }
  'repo:rebase': { args: [path: string, onto: string]; result: MergeResult }
  'repo:cherryPick': { args: [path: string, sha: string]; result: MergeResult }
  'repo:revert': { args: [path: string, sha: string]; result: MergeResult }
  'repo:reset': { args: [path: string, sha: string, mode: 'soft' | 'mixed' | 'hard']; result: void }
  /** Abort, continue or skip the merge/rebase/cherry-pick/revert in progress. */
  'repo:operation': { args: [path: string, action: 'abort' | 'continue' | 'skip']; result: void }

  // --- Stashes and tags -----------------------------------------------------
  /** Returns false if there was nothing to stash. */
  'repo:stash': {
    args: [path: string, options: { message?: string; includeUntracked: boolean }]
    result: boolean
  }
  /** Apply a stash; with `pop` it's removed afterwards (unless there were conflicts). */
  'repo:stashApply': { args: [path: string, index: number, pop: boolean]; result: MergeResult }
  'repo:stashDrop': { args: [path: string, index: number]; result: void }
  'repo:createTag': {
    args: [path: string, name: string, sha: string, message?: string]
    result: void
  }
  'repo:deleteTag': { args: [path: string, name: string]; result: void }

  // --- Remotes (progress via 'operation:progress') ----------------------------
  'repo:fetch': { args: [operationId: string, path: string, remote: string]; result: void }
  'repo:pull': {
    args: [operationId: string, path: string, options: { rebase: boolean }]
    result: MergeResult
  }
  'repo:push': { args: [operationId: string, path: string, request: PushRequest]; result: void }
  'repo:deleteRemoteBranch': {
    args: [operationId: string, path: string, remote: string, branch: string]
    result: void
  }
  'repo:pushTag': {
    args: [operationId: string, path: string, remote: string, tag: string]
    result: void
  }

  // --- File history, blame and compare -----------------------------------------
  /** Commits that changed a file, newest first, following renames. */
  'repo:getFileHistory': { args: [path: string, file: string]; result: FileHistoryEntry[] }
  /** Who last changed each line. Without `revision`, the working-tree version. */
  'repo:getBlame': { args: [path: string, file: string, revision?: string]; result: BlameResult }
  /** What `head` has that `base` doesn't (commits and changed files). */
  'repo:getComparison': { args: [path: string, base: string, head: string]; result: Comparison }

  // --- Conflicts ----------------------------------------------------------------
  /** Read a working-tree file (e.g. a conflicted one, with its markers). */
  'repo:readWorkingFile': { args: [path: string, file: string]; result: FileContent }
  /** Write the resolved contents of a conflicted file and stage it. */
  'repo:saveResolvedFile': { args: [path: string, file: string, content: string]; result: void }
  /** Resolve a whole conflicted file by keeping one side, or deleting it. */
  'repo:resolveFileWith': {
    args: [path: string, file: string, choice: 'current' | 'incoming' | 'delete']
    result: void
  }

  // --- Interactive rebase --------------------------------------------------
  /** Commits after `base` up to HEAD, oldest first ('root' = from the first commit). */
  'repo:getRebaseCommits': {
    args: [path: string, base: string]
    result: { commits: Commit[]; hasMerges: boolean }
  }
  'repo:interactiveRebase': {
    args: [path: string, base: string, plan: RebasePlanItem[]]
    result: MergeResult
  }

  // --- Undo / redo ------------------------------------------------------------
  'repo:getUndoState': { args: [path: string]; result: UndoState }
  /** Undo the last operation made in Trellis. Returns its label, or null if none. */
  'repo:undo': { args: [path: string]; result: string | null }
  'repo:redo': { args: [path: string]; result: string | null }

  // --- Git command log and credentials --------------------------------------
  'git:getCommandLog': { args: []; result: GitCommandEntry[] }
  /** Answer an `auth:prompt` event; null means the user cancelled. */
  'auth:respond': { args: [id: string, answer: string | null]; result: void }
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
  /** A git command finished (for the command log panel). */
  'git:command': GitCommandEntry
  /**
   * Git needs the user to type something (username, password, passphrase,
   * or to confirm an SSH host key). Reply with 'auth:respond'.
   */
  'auth:prompt': { id: string; prompt: string; secret: boolean }
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
  'repo:openFile': true,
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
  'repo:stage': true,
  'repo:unstage': true,
  'repo:discard': true,
  'repo:getFilePatch': true,
  'repo:applyPatch': true,
  'repo:commit': true,
  'repo:getHeadMessage': true,
  'repo:createBranch': true,
  'repo:checkout': true,
  'repo:moveBranch': true,
  'repo:renameBranch': true,
  'repo:deleteBranch': true,
  'repo:merge': true,
  'repo:rebase': true,
  'repo:cherryPick': true,
  'repo:revert': true,
  'repo:reset': true,
  'repo:operation': true,
  'repo:stash': true,
  'repo:stashApply': true,
  'repo:stashDrop': true,
  'repo:createTag': true,
  'repo:deleteTag': true,
  'repo:fetch': true,
  'repo:pull': true,
  'repo:push': true,
  'repo:deleteRemoteBranch': true,
  'repo:pushTag': true,
  'repo:getFileHistory': true,
  'repo:getBlame': true,
  'repo:getComparison': true,
  'repo:readWorkingFile': true,
  'repo:saveResolvedFile': true,
  'repo:resolveFileWith': true,
  'repo:getRebaseCommits': true,
  'repo:interactiveRebase': true,
  'repo:getUndoState': true,
  'repo:undo': true,
  'repo:redo': true,
  'git:getCommandLog': true,
  'auth:respond': true,
}
export const IPC_CHANNELS = Object.keys(channelMap) as IpcChannel[]

const eventMap: Record<IpcEvent, true> = {
  'repo:changed': true,
  'operation:progress': true,
  'git:command': true,
  'auth:prompt': true,
}
export const IPC_EVENTS = Object.keys(eventMap) as IpcEvent[]
