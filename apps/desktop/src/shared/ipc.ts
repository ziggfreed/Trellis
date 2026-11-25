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
  CommitFilter,
  CommitDetails,
  DiffTarget,
  FileContent,
  FileDiffContents,
  GitInstallation,
  Ref,
  Remote,
  MergeResult,
  CleanupBranch,
  RemoteCleanupBranch,
  CommitStats,
  Worktree,
  BlameResult,
  Comparison,
  FileHistoryEntry,
  RebasePlanItem,
  UndoState,
  CommitSignature,
  BisectState,
  GitIdentity,
  ImageDiff,
  StackBranch,
  LfsLock,
  Submodule,
  ReflogEntry,
  SigningConfig,
  RepoStatus,
  Stash,
} from '@trellis/git/types'
import type { FilePatch } from '@trellis/git/patch'
import type { CommandArgs, CommitDecoration, Contributions, PanelItem } from '@trellis/plugin-api'

// Re-export the git types the UI uses, so it can import everything from here.
export type * from '@trellis/git/types'

export type { FilePatch, Hunk, PatchLine, LineId } from '@trellis/git/patch'
export type {
  CommandArgs,
  CommandContribution,
  CommitDecoration,
  Contributions,
  MenuLocation,
  OperationEvent,
  PanelContribution,
  PanelItem,
  SettingContribution,
  StatusIcon,
} from '@trellis/plugin-api'

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
  /** Repositories starred on the home screen, in the order they were starred. */
  favouriteRepos: RepoTab[]
  /** How the diff viewer shows changes. */
  diffLayout: 'unified' | 'split'
  /** Folder last used as the destination for cloning. */
  lastCloneFolder: string | null
  /** Fetch open repositories in the background every N minutes (0 = off). */
  autoFetchMinutes: number
  /** Named groups of repositories that can be opened together. */
  workspaces: Workspace[]
  /** Keyboard shortcut overrides: action id -> shortcut ("" turns it off). */
  keybindings: Record<string, string>
  /** Command that starts the user's code editor, e.g. "code" (empty = VS Code). */
  editorCommand: string
  /** Ids of plugins the user turned off. */
  disabledPlugins: string[]
  /** Plugin folders loaded in place for development (Settings > Plugins). */
  pluginDevFolders: string[]
  /** Values of plugins' own settings: plugin id -> setting key -> value. */
  pluginSettings: Record<string, Record<string, unknown>>
  /** Built-in AI features (off until the user turns them on). */
  ai: AiSettings
  /** Look for new versions of Trellis in the background (see main/services/updater.ts). */
  checkForUpdates: boolean
  /**
   * Sizes of resizable panels, kept between launches: panel group id ->
   * panel id -> size in percent (see renderer features/layout/panel-layout.ts).
   */
  panelLayouts: Record<string, Record<string, number>>
  /** Push straight after committing (the "Push" box next to "Amend"). */
  pushAfterCommit: boolean
  /** Optional columns shown in the history list, in display order. */
  historyColumns: HistoryColumn[]
}

/** An optional column of the history list (the graph and message are always shown). */
export type HistoryColumn = 'changes' | 'author' | 'date' | 'committer' | 'commitDate' | 'sha'

/** A named group of repositories, e.g. "Work" or "Side projects". */
export interface Workspace {
  id: string
  name: string
  repos: RepoTab[]
}

export interface AppInfo {
  version: string
  /** Operating system, e.g. 'win32', 'darwin' or 'linux'. */
  platform: string
}

/** Result of asking to open a folder as a repository. */
export type OpenRepoResult =
  { ok: true; repo: RepoTab } | { ok: false; reason: 'not-a-repo' | 'not-found'; path: string }

// ---------------------------------------------------------------------------
// Plugins (see src/main/plugins and packages/plugin-api)
// ---------------------------------------------------------------------------

/** Where a plugin was loaded from. */
export type PluginSource = 'builtin' | 'installed' | 'dev'

/** A plugin as the plugin manager lists it. */
export interface PluginInfo {
  /** Package name; null when package.json couldn't be read. */
  id: string | null
  displayName: string
  version: string
  description: string
  path: string
  source: PluginSource
  enabled: boolean
  /**
   * running: activated; starting: being loaded; disabled: turned off;
   * error: can't run (see `error`).
   */
  state: 'running' | 'starting' | 'disabled' | 'error'
  error: string | null
  contributes: Contributions
  /** Commands whose code the plugin has registered (others can't run yet). */
  readyCommands: string[]
  /** Panels the plugin has registered (only these are shown). */
  readyPanels: string[]
}

/** A commit badge from a plugin, as the history graph shows it. */
export interface PluginCommitDecoration extends CommitDecoration {
  plugin: string
}

/** A plugin's status bar item. */
export interface PluginStatusItem {
  id: string
  plugin: string
  text: string
  tooltip: string
  command: string | undefined
}

/** Something a plugin asked the UI to do; the UI answers with plugins:uiResponse. */
export type PluginUiRequest =
  | { kind: 'message'; plugin: string; message: string; level: 'info' | 'warning' | 'error' }
  | {
      kind: 'input'
      title: string
      prompt?: string
      value?: string
      placeholder?: string
      password?: boolean
    }
  | { kind: 'quickPick'; items: { label: string; detail?: string }[]; placeholder?: string }
  | { kind: 'setCommitMessage'; repo: string; message: string }

// ---------------------------------------------------------------------------
// AI (see src/main/ai)
// ---------------------------------------------------------------------------

/**
 * Which service answers AI requests.
 * - anthropic: Claude, via the Anthropic API.
 * - openai: any service with an OpenAI-style chat completions API (OpenAI,
 *   OpenRouter, or a local model in Ollama or LM Studio), set by `baseUrl`.
 */
export type AiProvider = 'anthropic' | 'openai'

export interface AiSettings {
  enabled: boolean
  provider: AiProvider
  /** Model name; empty uses the provider's default. */
  model: string
  /** API address; empty uses the provider's default. */
  baseUrl: string
}

/** Something to ask the AI. Main gathers the repository data itself. */
export type AiTask =
  | { kind: 'commitMessage'; repo: string }
  | { kind: 'explainCommit'; repo: string; sha: string }
  | { kind: 'resolveConflict'; repo: string; path: string }
  | { kind: 'test' }

export interface AiResult {
  /** The answer (for resolveConflict: the explanation part only). */
  text: string
  /** The repository data was too long and only the first part was sent. */
  truncated: boolean
  /**
   * resolveConflict only: the suggested file contents, or null if the
   * answer didn't include a usable resolution.
   */
  resolved?: string | null
}

/**
 * Where an app update is up to:
 * - available: a newer version exists but can't install itself (unsigned
 *   macOS build); `url` is where to download it.
 * - ready: downloaded; restart to install.
 * - unsupported: this build can't update (e.g. running from source).
 */
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'upToDate' }
  | { state: 'available'; version: string; url: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'unsupported'; message: string }
  | { state: 'error'; message: string }

/** Repositories found by scanning a folder. */
export interface ScanResult {
  /** Found repositories, sorted by path. */
  repos: RepoTab[]
  /** True if the scan stopped at a limit, so there may be more. */
  truncated: boolean
}

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
  /**
   * The author name/email commits will use: in a repository, or the global
   * git config when `repo` is null.
   */
  'git:getIdentity': { args: [repo: string | null]; result: GitIdentity }
  /** Save the author name/email in the global git config. */
  'git:setIdentity': { args: [name: string, email: string]; result: void }
  'git:checkInstallation': { args: []; result: GitInstallation }

  // --- App updates (see src/main/services/updater.ts) ---------------------------
  'update:getStatus': { args: []; result: UpdateStatus }
  /** Look for a new version now. */
  'update:check': { args: []; result: void }
  /** Quit and install a downloaded update. */
  'update:install': { args: []; result: void }

  'settings:get': { args: []; result: Settings }
  /** Merge a partial update into the saved settings. Returns the new settings. */
  'settings:update': { args: [patch: Partial<Settings>]; result: Settings }

  /** Show the native "choose folder" dialog. Returns null if cancelled. */
  'dialog:pickFolder': { args: [options?: { title?: string }]; result: string | null }

  /** Check that `path` is (inside) a git repo and return its root. */
  'repo:resolve': { args: [path: string]; result: OpenRepoResult }
  /** Find the git repositories inside a folder (a few levels deep). */
  'repo:scanFolder': { args: [folder: string]; result: ScanResult }
  /** Open the repo folder in the system file manager. */
  'repo:showInFolder': { args: [path: string]; result: void }
  /** Open the user's terminal program in the repository folder. */
  'shell:openTerminal': { args: [path: string]; result: void }
  /** Open the repository (and optionally one file) in the user's code editor. */
  'shell:openEditor': { args: [path: string, file?: string]; result: void }
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
  /** Hashes of commits matching a filter (text, author, path, dates, code), newest first. */
  'repo:findCommits': {
    args: [path: string, filter: CommitFilter, scope: LogScope]
    result: string[]
  }
  'repo:getRefs': { args: [path: string]; result: Ref[] }
  'repo:getRemotes': { args: [path: string]; result: Remote[] }
  'repo:getStashes': { args: [path: string]; result: Stash[] }
  'repo:getCommit': { args: [path: string, sha: string]; result: CommitDetails }
  /** Files and lines changed by each commit (for the history's Changes column), by hash. */
  'repo:getCommitStats': {
    args: [path: string, shas: string[]]
    result: Record<string, CommitStats>
  }
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

  // --- Managing remotes ---------------------------------------------------------
  'repo:addRemote': { args: [path: string, name: string, url: string]; result: void }
  'repo:renameRemote': { args: [path: string, from: string, to: string]; result: void }
  'repo:setRemoteUrl': { args: [path: string, name: string, url: string]; result: void }
  'repo:removeRemote': { args: [path: string, name: string]; result: void }

  // --- Signatures ---------------------------------------------------------------
  /** Check a commit's GPG/SSH signature (runs gpg/ssh-keygen, so one commit at a time). */
  'repo:getSignature': { args: [path: string, sha: string]; result: CommitSignature }
  /** The global commit-signing settings. */
  'git:getSigning': { args: []; result: SigningConfig }
  'git:setSigning': { args: [config: SigningConfig]; result: void }

  // --- Reflog -------------------------------------------------------------------
  /** Recent HEAD reflog entries, and which of their commits are on no branch. */
  'repo:getReflog': {
    args: [path: string]
    result: { entries: ReflogEntry[]; unreachable: string[] }
  }

  // --- .gitignore ---------------------------------------------------------------
  /**
   * Add an ignore pattern for `file` (this file, its extension or its folder)
   * to the root .gitignore. Returns the pattern and the tracked files that
   * now match ignore rules (ignoring doesn't affect them until untracked).
   */
  'repo:ignore': {
    args: [path: string, file: string, kind: 'file' | 'extension' | 'folder']
    result: { pattern: string; added: boolean; trackedMatches: string[] }
  }
  /** Stop tracking files, keeping them on disk (git rm --cached). */
  'repo:untrack': { args: [path: string, files: string[]]; result: void }

  // --- Submodules ---------------------------------------------------------------
  'repo:getSubmodules': { args: [path: string]; result: Submodule[] }
  /** Initialise and update submodules (all, or `paths`), with progress. */
  'repo:updateSubmodules': {
    args: [operationId: string, path: string, paths: string[]]
    result: void
  }
  /** Add a repository as a submodule in `folder`, with progress. */
  'repo:addSubmodule': {
    args: [operationId: string, path: string, url: string, folder: string]
    result: void
  }
  /** Copy submodule URLs from .gitmodules into the local config. */
  'repo:syncSubmodules': { args: [path: string]; result: void }

  // --- Git LFS --------------------------------------------------------------------
  /** Whether git-lfs is installed (its version) and the repository's LFS patterns. */
  'repo:getLfs': { args: [path: string]; result: { version: string | null; patterns: string[] } }
  'repo:lfsTrack': { args: [path: string, pattern: string]; result: void }
  'repo:lfsUntrack': { args: [path: string, pattern: string]; result: void }
  /** Locked files (rejects if the LFS server doesn't support locking). */
  'repo:getLfsLocks': { args: [path: string]; result: LfsLock[] }
  'repo:lfsLock': { args: [path: string, file: string]; result: void }
  'repo:lfsUnlock': { args: [path: string, file: string, force: boolean]; result: void }

  // --- Image diff ---------------------------------------------------------------
  /** Both versions of an image, as base64, for the image diff. */
  'repo:getImageDiff': { args: [path: string, target: DiffTarget]; result: ImageDiff }

  // --- Bisect ---------------------------------------------------------------------
  /** The bisect in progress, or null. */
  'repo:getBisect': { args: [path: string]; result: BisectState | null }
  /** Start bisecting from a bad commit (and a good one, if known). */
  'repo:bisectStart': { args: [path: string, bad: string, good: string | null]; result: void }
  /** Mark a commit (null: the checked-out one) good, bad or skipped. */
  'repo:bisectMark': {
    args: [path: string, verdict: 'good' | 'bad' | 'skip', sha: string | null]
    result: void
  }
  /** Stop bisecting and return to where it started. */
  'repo:bisectReset': { args: [path: string]; result: void }

  // --- Stacked branches -----------------------------------------------------------
  /** Local branches stacked between `base` and `top` (bottom first, `top` last). */
  'repo:getStack': { args: [path: string, top: string, base: string]; result: StackBranch[] }
  /** Rebase the current branch onto `onto`, moving the branches stacked below it too. */
  'repo:rebaseStack': { args: [path: string, onto: string]; result: MergeResult }
  /** Push several branches with force-with-lease (after a stack rebase), with progress. */
  'repo:pushStack': {
    args: [operationId: string, path: string, remote: string, branches: string[]]
    result: void
  }

  // --- Editing ---------------------------------------------------------------------
  /** Save a working-tree file (editing in the diff view). */
  'repo:writeWorkingFile': { args: [path: string, file: string, content: string]; result: void }

  // --- Cleaning up branches -----------------------------------------------------
  /** The main branch (origin's default, or main/master), or null. */
  'repo:getDefaultBranch': { args: [path: string]; result: string | null }
  /**
   * Local branches that could be deleted, with whether each is merged into
   * `target` (normally, or by squash/rebase) and whether its remote branch exists.
   */
  'repo:getBranchCleanup': { args: [path: string, target: string]; result: CleanupBranch[] }
  /** Remote branches whose work is already on `target` (normally, or by squash/rebase). */
  'repo:getRemoteBranchCleanup': {
    args: [path: string, target: string]
    result: RemoteCleanupBranch[]
  }
  /**
   * Delete several branches as one undoable operation. Names listed in
   * `force` are deleted even if git thinks they're unmerged (squash-merged ones).
   */
  'repo:deleteBranches': {
    args: [path: string, names: string[], options?: { force?: string[] }]
    result: { deleted: string[]; failed: { name: string; error: string }[] }
  }

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
  /** Delete several branches on one remote with a single push (can't be undone). */
  'repo:deleteRemoteBranches': {
    args: [operationId: string, path: string, remote: string, branches: string[]]
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
  /** Whether `ancestor` is in the history of `commit`. */
  'repo:isAncestor': { args: [path: string, ancestor: string, commit: string]; result: boolean }
  /** The commit hash a branch, tag or hash points to, or null if it names no commit. */
  'repo:resolveCommit': { args: [path: string, ref: string]; result: string | null }

  // --- Worktrees ----------------------------------------------------------------
  'repo:getWorktrees': { args: [path: string]; result: Worktree[] }
  /** Create a worktree at `folder` for an existing branch, or a new branch. */
  'repo:addWorktree': {
    args: [path: string, folder: string, options: { branch?: string; newBranch?: string }]
    result: OpenRepoResult
  }
  'repo:removeWorktree': { args: [path: string, folder: string, force: boolean]; result: void }
  'repo:pruneWorktrees': { args: [path: string]; result: void }

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

  // --- Plugins (see src/main/plugins) ------------------------------------------
  'plugins:list': { args: []; result: PluginInfo[] }
  'plugins:setEnabled': { args: [id: string, enabled: boolean]; result: void }
  /** Stop every plugin and load them again (picks up changed plugin code). */
  'plugins:reload': { args: []; result: void }
  /** Run a plugin command; `args` says where it was run from. */
  'plugins:executeCommand': { args: [command: string, args: CommandArgs]; result: void }
  'plugins:statusItems': { args: []; result: PluginStatusItem[] }
  /** Answer a `plugins:ui` request (undefined = cancelled / nothing). */
  'plugins:uiResponse': { args: [requestId: number, value: unknown]; result: void }
  /** Copy a plugin folder into the plugins folder. Returns the plugin id. */
  'plugins:installFromFolder': { args: [folder: string]; result: string }
  /** Download a plugin from the npm registry. Returns the plugin id. */
  'plugins:installFromNpm': { args: [name: string]; result: string }
  /** Delete an installed plugin (built-in plugins can only be disabled). */
  'plugins:uninstall': { args: [id: string]; result: void }
  /** Load a folder in place, for developing a plugin. */
  'plugins:addDevFolder': { args: [folder: string]; result: void }
  'plugins:removeDevFolder': { args: [folder: string]; result: void }
  /** The items of a plugin panel for a repository. */
  'plugins:panelItems': { args: [panel: string, repo: string]; result: PanelItem[] }
  /** Plugin badges for commits in a repository. */
  'plugins:decorations': { args: [repo: string]; result: PluginCommitDecoration[] }

  // --- AI (see src/main/ai) -----------------------------------------------------
  /**
   * Whether an API key is saved, whether this system can store one, and
   * whether it would only be weakly protected (Linux without a keyring).
   */
  'ai:keyStatus': {
    args: []
    result: { hasKey: boolean; secureStorage: boolean; weakStorage: boolean }
  }
  /** Save the API key (encrypted), or remove it with null. */
  'ai:setKey': { args: [key: string | null]; result: void }
  /**
   * Run an AI task. The answer streams in as `ai:chunk` events with the same
   * requestId, and the full answer is returned at the end.
   */
  'ai:run': { args: [requestId: string, task: AiTask]; result: AiResult }
  /** Stop a running task (its ai:run rejects). */
  'ai:cancel': { args: [requestId: string]; result: void }
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
  /** The plugin list or a plugin's state changed; fetch plugins:list again. */
  'plugins:changed': Record<string, never>
  /** The full list of plugin status bar items. */
  'plugins:statusItems': PluginStatusItem[]
  /** A plugin wants the UI to do something; reply with plugins:uiResponse. */
  'plugins:ui': { requestId: number; request: PluginUiRequest }
  /** A plugin panel's items changed; fetch plugins:panelItems again. */
  'plugins:panelChanged': { panel: string }
  /** Plugin commit badges changed for a repository. */
  'plugins:decorationsChanged': { repo: string }
  /** More of an AI answer arrived. */
  'ai:chunk': { requestId: string; text: string }
  /** The app update status changed. */
  'update:status': UpdateStatus
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
  'update:getStatus': true,
  'update:check': true,
  'update:install': true,
  'git:getIdentity': true,
  'git:setIdentity': true,
  'settings:get': true,
  'settings:update': true,
  'dialog:pickFolder': true,
  'repo:resolve': true,
  'repo:scanFolder': true,
  'repo:showInFolder': true,
  'repo:openFile': true,
  'shell:openTerminal': true,
  'shell:openEditor': true,
  'repo:setWatched': true,
  'repo:getStatus': true,
  'repo:getLog': true,
  'repo:findCommits': true,
  'repo:getRefs': true,
  'repo:getRemotes': true,
  'repo:getStashes': true,
  'repo:getCommit': true,
  'repo:getCommitStats': true,
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
  'repo:addRemote': true,
  'repo:renameRemote': true,
  'repo:setRemoteUrl': true,
  'repo:removeRemote': true,
  'repo:getSignature': true,
  'git:getSigning': true,
  'git:setSigning': true,
  'repo:getReflog': true,
  'repo:ignore': true,
  'repo:untrack': true,
  'repo:getDefaultBranch': true,
  'repo:getSubmodules': true,
  'repo:updateSubmodules': true,
  'repo:addSubmodule': true,
  'repo:syncSubmodules': true,
  'repo:getLfs': true,
  'repo:lfsTrack': true,
  'repo:lfsUntrack': true,
  'repo:getLfsLocks': true,
  'repo:lfsLock': true,
  'repo:lfsUnlock': true,
  'repo:writeWorkingFile': true,
  'repo:getImageDiff': true,
  'repo:getBisect': true,
  'repo:bisectStart': true,
  'repo:bisectMark': true,
  'repo:bisectReset': true,
  'repo:getStack': true,
  'repo:rebaseStack': true,
  'repo:pushStack': true,
  'repo:getBranchCleanup': true,
  'repo:getRemoteBranchCleanup': true,
  'repo:deleteBranches': true,
  'repo:fetch': true,
  'repo:pull': true,
  'repo:push': true,
  'repo:deleteRemoteBranch': true,
  'repo:deleteRemoteBranches': true,
  'repo:pushTag': true,
  'repo:getFileHistory': true,
  'repo:getBlame': true,
  'repo:getComparison': true,
  'repo:isAncestor': true,
  'repo:resolveCommit': true,
  'repo:getWorktrees': true,
  'repo:addWorktree': true,
  'repo:removeWorktree': true,
  'repo:pruneWorktrees': true,
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
  'plugins:list': true,
  'plugins:setEnabled': true,
  'plugins:reload': true,
  'plugins:executeCommand': true,
  'plugins:statusItems': true,
  'plugins:uiResponse': true,
  'plugins:installFromFolder': true,
  'plugins:installFromNpm': true,
  'plugins:uninstall': true,
  'plugins:addDevFolder': true,
  'plugins:removeDevFolder': true,
  'plugins:panelItems': true,
  'plugins:decorations': true,
  'ai:keyStatus': true,
  'ai:setKey': true,
  'ai:run': true,
  'ai:cancel': true,
}
export const IPC_CHANNELS = Object.keys(channelMap) as IpcChannel[]

const eventMap: Record<IpcEvent, true> = {
  'repo:changed': true,
  'operation:progress': true,
  'git:command': true,
  'auth:prompt': true,
  'plugins:changed': true,
  'plugins:statusItems': true,
  'plugins:ui': true,
  'plugins:panelChanged': true,
  'plugins:decorationsChanged': true,
  'ai:chunk': true,
  'update:status': true,
}
export const IPC_EVENTS = Object.keys(eventMap) as IpcEvent[]
