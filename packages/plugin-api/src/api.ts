/**
 * The API a plugin uses, passed to its `activate` function:
 *
 *   // index.js (the "main" file in package.json)
 *   export function activate(trellis, context) {
 *     context.subscriptions.push(
 *       trellis.commands.register('hello.world', async ({ repo }) => {
 *         trellis.ui.showMessage(repo ? `Hello from ${repo}` : 'Hello!')
 *       }),
 *     )
 *   }
 *
 * Plugins run in a separate process (the "plugin host"), so every call that
 * reaches into the app is asynchronous and returns a Promise.
 *
 * Plugins are trusted, like VS Code extensions: they run with the same
 * rights as Trellis itself.
 */

/** Something that can be undone or stopped, e.g. a registered command. */
export interface Disposable {
  dispose(): void
}

/**
 * Passed to a command when it runs. Which fields are set depends on where
 * it was run from: the palette only knows the repository; a commit, branch
 * or file menu adds what was right-clicked.
 */
export interface CommandArgs {
  /** The repository (absolute path), or null on the home screen. */
  repo: string | null
  /** From a commit menu: the commit's full hash. */
  sha?: string
  /** From a branch menu: the branch name, e.g. "main" or "origin/main". */
  branch?: string
  /** From a file menu: the file's path inside the repository. */
  path?: string
  /** From a panel item: the item's `id`. */
  item?: string
}

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface GitRunOptions {
  /**
   * Set this for commands that change the repository. The change is then
   * recorded so the user can undo it (Ctrl/Cmd+Z), and listed under this
   * label, e.g. "Squash fixups".
   */
  undoLabel?: string
  /** Exit codes that aren't errors. Default [0]; anything else rejects. */
  okExitCodes?: number[]
}

export interface QuickPickItem {
  label: string
  /** Shown next to the label, in muted text. */
  detail?: string
}

export interface StatusBarItem extends Disposable {
  /** Text shown in the status bar. Empty hides the item. */
  text: string
  /** Hover text. */
  tooltip: string
  /** Command to run when clicked (the active repository is passed). */
  command: string | undefined
}

/**
 * A git operation that changed a repository, reported by
 * `trellis.repos.onDidRunOperation`. Covers commands run by Trellis and by
 * plugins, but not by other apps or a terminal.
 */
export interface OperationEvent {
  /** The repository (absolute path). */
  repo: string
  kind:
    | 'commit'
    | 'checkout'
    | 'fetch'
    | 'pull'
    | 'push'
    | 'merge'
    | 'rebase'
    | 'reset'
    | 'cherry-pick'
    | 'revert'
    | 'branch'
    | 'tag'
    | 'stash'
}

/** The small icons Trellis can draw next to panel items and commits. */
export type StatusIcon = 'success' | 'failure' | 'pending' | 'neutral' | 'info' | 'warning'

/** One row in a plugin panel. */
export interface PanelItem {
  /** Passed to `command` as `args.item`, so one command can serve many items. */
  id?: string
  label: string
  /** Muted text after the label. */
  description?: string
  tooltip?: string
  icon?: StatusIcon
  /** A command of this plugin to run when the item is clicked. */
  command?: string
}

/** Supplies a panel's items; see `trellis.ui.registerPanel`. */
export interface PanelProvider {
  /**
   * The items to show for this repository (called when the panel is shown
   * or refreshed). Return [] to hide the panel, e.g. in repositories your
   * plugin doesn't apply to.
   */
  getItems(repo: string): PanelItem[] | Promise<PanelItem[]>
}

export interface Panel extends Disposable {
  /** Ask Trellis to call getItems() again, e.g. after new data arrived. */
  refresh(): void
}

/** A badge drawn on a commit in the history graph, e.g. a CI result. */
export interface CommitDecoration {
  /** The commit's full hash. */
  sha: string
  icon: StatusIcon
  /** Hover text. */
  tooltip?: string
  /** Opened in the browser when the badge is clicked (http/https only). */
  url?: string
}

/** The `trellis` object passed to activate(). */
export interface TrellisApi {
  /** The running Trellis version, e.g. "0.2.0". */
  readonly version: string

  commands: {
    /**
     * Supply the code for a command declared in `contributes.commands`.
     * Returns a Disposable that unregisters it.
     */
    register(id: string, run: (args: CommandArgs) => unknown): Disposable
  }

  repos: {
    /** The repository in the active tab, or null on the home screen. */
    active(): Promise<string | null>
    /** Every repository open in a tab. */
    open(): Promise<string[]>
    /** Called when the user switches tab (null = home screen). */
    onDidChangeActive(listener: (repo: string | null) => void): Disposable
    /** Called when files or refs change in an open repository. */
    onDidChange(listener: (repo: string) => void): Disposable
    /**
     * Called after a git command that changes a repository succeeds (commit,
     * checkout, fetch, push...). Careful: commands your own plugin runs are
     * reported too, so don't run a changing command from this listener
     * without a guard.
     */
    onDidRunOperation(listener: (event: OperationEvent) => void): Disposable
  }

  git: {
    /**
     * Run git in a repository, e.g. `trellis.git.run(repo, ['log', '-1'])`.
     * Commands go through the same queue as the app's own, so they never
     * run at the same time as another change to that repository, and they
     * show up in the Git log panel.
     */
    run(repo: string, args: string[], options?: GitRunOptions): Promise<GitResult>
  }

  ui: {
    /** Show a short notification. */
    showMessage(message: string, kind?: 'info' | 'warning' | 'error'): void
    /** Ask for some text. Resolves to undefined if cancelled. */
    showInput(options: {
      title: string
      prompt?: string
      value?: string
      placeholder?: string
      /** Hide what's typed (for passwords and tokens). */
      password?: boolean
    }): Promise<string | undefined>
    /** Ask the user to choose from a list. Resolves to undefined if cancelled. */
    showQuickPick<T extends QuickPickItem>(
      items: T[],
      options?: { placeholder?: string },
    ): Promise<T | undefined>
    /** Open a web page in the user's browser (http and https only). */
    openExternal(url: string): Promise<void>
    /** Add an item to the status bar at the bottom of the window. */
    createStatusBarItem(): StatusBarItem
    /**
     * Put a message in a repository's commit box (Changes view), ready for
     * the user to review and commit.
     */
    setCommitMessage(repo: string, message: string): Promise<void>
    /**
     * Supply the items of a panel declared in `contributes.panels`. The panel
     * appears in the repository sidebar once registered.
     */
    registerPanel(id: string, provider: PanelProvider): Panel
  }

  graph: {
    /**
     * Show badges on commits in a repository's history graph. Each call
     * replaces this plugin's previous badges for that repository; pass []
     * to clear them.
     */
    setDecorations(repo: string, decorations: CommitDecoration[]): void
  }

  /**
   * Encrypted storage for tokens and passwords, using the operating
   * system's keychain (Keychain on macOS, DPAPI on Windows, the secret
   * service on Linux). Each plugin sees only its own secrets. Rejects if
   * the system has no secure storage (some Linux setups).
   */
  secrets: {
    get(key: string): Promise<string | undefined>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
  }

  settings: {
    /** The current value of one of the plugin's `contributes.settings`. */
    get<T = unknown>(key: string): T
    /** Called after the user changes any of the plugin's settings. */
    onDidChange(listener: () => void): Disposable
  }
}

/** The second argument to activate(): things specific to this plugin. */
export interface PluginContext {
  /** The plugin's id (its package name). */
  readonly id: string
  /** Absolute path of the plugin's folder. */
  readonly path: string
  /** Everything pushed here is disposed when the plugin stops. */
  readonly subscriptions: Disposable[]
  /** Small key/value storage that persists between runs (JSON-serialisable values). */
  readonly storage: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  }
}

/** The shape of a plugin's main module. */
export interface PluginModule {
  activate(trellis: TrellisApi, context: PluginContext): void | Promise<void>
  /** Optional clean-up when the plugin stops (subscriptions are disposed for you). */
  deactivate?(): void | Promise<void>
}
