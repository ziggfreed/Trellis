/**
 * Messages between the main process and the plugin host process
 * (plugin-host.ts). Both sides use the small RPC helper in rpc.ts: a
 * "request" gets exactly one "response" with the same id; "event"s get none.
 *
 * Main → host requests:   see HostMethods
 * Host → main requests:   see MainMethods
 * Main → host events:     see HostEvents
 * Host → main events:     see MainEvents
 */
import type {
  CommandArgs,
  CommitDecoration,
  GitResult,
  GitRunOptions,
  OperationEvent,
  PanelItem,
  QuickPickItem,
} from '@trellis/plugin-api'

/** What the host needs to load one plugin. */
export interface HostPlugin {
  id: string
  /** Absolute path of the plugin folder. */
  path: string
  /** Absolute path of its entry file. */
  main: string
  /** Current values of its settings (defaults filled in). */
  settings: Record<string, unknown>
  /** Command ids declared in its manifest (the only ones it may register). */
  commands: string[]
  /** Panel ids declared in its manifest (the only ones it may register). */
  panels: string[]
}

/** Methods the host implements (main calls them). */
export type HostMethods = {
  /** Load and activate these plugins. Resolves when all have tried. */
  start(params: { appVersion: string; storageDir: string; plugins: HostPlugin[] }): void
  /** Run a command a plugin registered. */
  executeCommand(params: { command: string; args: CommandArgs }): unknown
  /** Ask a plugin panel for its items. */
  getPanelItems(params: { panel: string; repo: string }): PanelItem[]
}

/** Methods main implements (the host calls them on behalf of a plugin). */
export type MainMethods = {
  'git.run'(params: {
    plugin: string
    repo: string
    args: string[]
    options: GitRunOptions
  }): GitResult
  'repos.active'(): string | null
  'repos.open'(): string[]
  'ui.showMessage'(params: {
    plugin: string
    message: string
    kind: 'info' | 'warning' | 'error'
  }): void
  'ui.showInput'(params: {
    title: string
    prompt?: string
    value?: string
    placeholder?: string
    password?: boolean
  }): string | undefined
  'ui.showQuickPick'(params: { items: QuickPickItem[]; placeholder?: string }): number | undefined
  'ui.openExternal'(params: { url: string }): void
  'ui.setCommitMessage'(params: { repo: string; message: string }): void
  'secrets.get'(params: { plugin: string; key: string }): string | undefined
  'secrets.set'(params: { plugin: string; key: string; value: string }): void
  'secrets.delete'(params: { plugin: string; key: string }): void
}

/** A status bar item as the UI shows it. */
export interface StatusItem {
  /** Unique across plugins: "<plugin id>:<n>". */
  id: string
  plugin: string
  text: string
  tooltip: string
  command: string | undefined
}

/** Events main sends to the host. */
export type HostEvents = {
  activeRepo: { repo: string | null }
  repoChanged: { repo: string }
  settings: { plugin: string; values: Record<string, unknown> }
  operation: OperationEvent
}

/** Events the host sends to main. */
export type MainEvents = {
  /** A plugin activated (error = it failed, with the message). */
  activated: { plugin: string; error?: string }
  /** The commands a plugin has registered code for. */
  commands: { plugin: string; commands: string[] }
  statusItem: StatusItem
  statusItemRemoved: { id: string }
  /** A plugin registered (or, with removed, unregistered) a panel. */
  panel: { plugin: string; panel: string; removed?: boolean }
  /** A panel asked to be refreshed. */
  panelChanged: { panel: string }
  /** A plugin's commit badges for one repository (replacing its previous ones). */
  decorations: { plugin: string; repo: string; decorations: CommitDecoration[] }
}

/**
 * How a side implements the other side's view of its methods: each may
 * return its result directly or as a Promise.
 */
export type Implementation<M> = {
  [K in keyof M]: M[K] extends (params: infer P) => infer R ? (params: P) => R | Promise<R> : never
}

/** The raw messages on the wire. */
export type RpcMessage =
  | { kind: 'request'; id: number; method: string; params: unknown }
  | { kind: 'response'; id: number; result?: unknown; error?: string }
  | { kind: 'event'; name: string; payload: unknown }
