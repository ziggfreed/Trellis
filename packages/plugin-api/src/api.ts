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
