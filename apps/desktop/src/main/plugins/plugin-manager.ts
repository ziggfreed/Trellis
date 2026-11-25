/**
 * PluginManager: the main-process side of plugins.
 *
 *   discover  find plugin folders and check their manifests (discovery.ts)
 *   run       start the plugin host process (plugin-host.ts) with every
 *             enabled, valid plugin, and restart it on "Reload plugins"
 *   serve     answer the host's requests on behalf of plugins: run git
 *             (through the repo queue, logged, optionally undoable), and
 *             relay UI requests (messages, input, pick lists) to the window
 *   report    keep each plugin's state, registered commands and status bar
 *             items, and tell the UI when they change
 *
 * Installing and removing plugin folders is in install.ts.
 */
import { utilityProcess, type UtilityProcess } from 'electron'
import * as git from '@trellis/git'
import { settingValues } from '@trellis/plugin-api'
import type {
  CommandArgs,
  OperationEvent,
  PanelItem,
  PluginCommitDecoration,
  PluginInfo,
  PluginStatusItem,
  PluginUiRequest,
  Settings,
} from '@shared/ipc'
import pluginHostPath from './plugin-host?modulePath'
import { runExclusive } from '../services/repo-queue'
import type { SecretStore } from '../services/secret-store'
import { discoverPlugins, type DiscoveredPlugin } from './discovery'
import { createRpc, type Rpc } from './rpc'
import type { HostEvents, HostMethods, Implementation, MainEvents, MainMethods } from './protocol'

/** How long plugins get to clean up when the host stops. */
const STOP_TIMEOUT_MS = 1500

export interface PluginManagerOptions {
  appVersion: string
  builtInDir: string
  installedDir: string
  storageDir: string
  getSettings: () => Settings
  /** Tell the UI the plugin list or states changed. */
  onChanged: () => void
  onStatusItems: (items: PluginStatusItem[]) => void
  /** Ask the UI to do something; resolves with its answer. */
  askUi: (request: PluginUiRequest) => Promise<unknown>
  /** Open a URL in the browser. */
  openExternal: (url: string) => Promise<void>
  /** Where plugin secrets are kept (encrypted). */
  secrets: SecretStore
  /** A plugin panel asked to be refreshed. */
  onPanelChanged: (panel: string) => void
  /** Plugin commit badges changed for a repository. */
  onDecorationsChanged: (repo: string) => void
}

const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

/** Where a plugin's secret `key` is kept in the SecretStore. */
export const pluginSecretKey = (plugin: string, key: string) => `plugin:${plugin}:${key}`

type HostRpc = Rpc<HostMethods & { stop(): void }, HostEvents>

export class PluginManager {
  private plugins: DiscoveredPlugin[] = []
  /** Plugin id → state while the host runs it. */
  private states = new Map<
    string,
    { state: 'starting' | 'running' | 'error'; error: string | null }
  >()
  private readyCommands = new Map<string, string[]>()
  private statusItems = new Map<string, PluginStatusItem>()
  /** Plugin id → panels it has registered. */
  private readyPanels = new Map<string, Set<string>>()
  /** Repository → plugin id → that plugin's commit badges. */
  private decorations = new Map<string, Map<string, PluginCommitDecoration[]>>()
  private host: { process: UtilityProcess; rpc: HostRpc } | null = null
  /** Serialises start/stop so a quick double "Reload" can't start two hosts. */
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(private readonly options: PluginManagerOptions) {}

  /** Find plugins and start the enabled ones. */
  start(): Promise<void> {
    return this.queue(() => this.startNow())
  }

  /** Stop all plugins, then find and start them again. */
  reload(): Promise<void> {
    return this.queue(async () => {
      await this.stopNow()
      await this.startNow()
    })
  }

  /** Stop the host for good (app quitting). */
  dispose(): Promise<void> {
    return this.queue(() => this.stopNow())
  }

  list(): PluginInfo[] {
    const disabled = new Set(this.options.getSettings().disabledPlugins)
    return this.plugins.map((plugin) => {
      const id = plugin.manifest?.id ?? null
      const enabled = id !== null && !disabled.has(id)
      const live = id ? this.states.get(id) : undefined
      const error = plugin.error ?? live?.error ?? null
      return {
        id,
        displayName: plugin.manifest?.displayName ?? plugin.path,
        version: plugin.manifest?.version ?? '',
        description: plugin.manifest?.description ?? '',
        path: plugin.path,
        source: plugin.source,
        enabled,
        state: error ? 'error' : !enabled ? 'disabled' : (live?.state ?? 'starting'),
        error,
        contributes: plugin.manifest?.contributes ?? {
          commands: [],
          menus: {},
          settings: [],
          panels: [],
        },
        readyCommands: (id && this.readyCommands.get(id)) || [],
        readyPanels: [...((id && this.readyPanels.get(id)) || [])],
      }
    })
  }

  getStatusItems(): PluginStatusItem[] {
    return [...this.statusItems.values()]
  }

  async executeCommand(command: string, args: CommandArgs): Promise<void> {
    if (!this.host) throw new Error('No plugins are running.')
    await this.host.rpc.request('executeCommand', { command, args })
  }

  async getPanelItems(panel: string, repo: string): Promise<PanelItem[]> {
    if (!this.host) return []
    return await this.host.rpc.request('getPanelItems', { panel, repo })
  }

  getDecorations(repo: string): PluginCommitDecoration[] {
    return [...(this.decorations.get(repo)?.values() ?? [])].flat()
  }

  /** Tell plugins about a git operation (see operation-kind.ts). */
  operationRan(event: OperationEvent): void {
    this.host?.rpc.emit('operation', event)
  }

  /** A plugin's settings changed: send it the new values. */
  settingsChanged(pluginId: string): void {
    const plugin = this.plugins.find((p) => p.manifest?.id === pluginId)
    if (!plugin?.manifest || !this.host) return
    this.host.rpc.emit('settings', {
      plugin: pluginId,
      values: settingValues(
        plugin.manifest.contributes.settings,
        this.options.getSettings().pluginSettings[pluginId],
      ),
    })
  }

  activeRepoChanged(repo: string | null): void {
    this.host?.rpc.emit('activeRepo', { repo })
  }

  repoChanged(repo: string): void {
    this.host?.rpc.emit('repoChanged', { repo })
  }

  // -------------------------------------------------------------------------

  private queue(task: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(task, task)
    this.lifecycle = next.catch(() => {})
    return next
  }

  private async startNow(): Promise<void> {
    const settings = this.options.getSettings()
    this.plugins = await discoverPlugins({
      builtInDir: this.options.builtInDir,
      installedDir: this.options.installedDir,
      devFolders: settings.pluginDevFolders,
      appVersion: this.options.appVersion,
    })
    const disabled = new Set(settings.disabledPlugins)
    const toRun = this.plugins.filter(
      (p): p is DiscoveredPlugin & { manifest: NonNullable<DiscoveredPlugin['manifest']> } =>
        p.manifest !== null && p.error === null && !disabled.has(p.manifest.id),
    )
    this.states = new Map(toRun.map((p) => [p.manifest.id, { state: 'starting', error: null }]))
    this.options.onChanged()
    if (toRun.length === 0) return

    const child = utilityProcess.fork(pluginHostPath, [], { serviceName: 'Trellis plugins' })
    const rpc: HostRpc = createRpc<HostMethods & { stop(): void }, HostEvents>(
      (message) => child.postMessage(message),
      this.mainMethods(),
      (name, payload) => this.onHostEvent(name as keyof MainEvents, payload),
    )
    child.on('message', (message) => rpc.receive(message))
    child.on('exit', () => {
      rpc.close('The plugin host stopped.')
      if (this.host?.process !== child) return
      // Unexpected exit: report it on every plugin that was running.
      this.host = null
      for (const [id] of this.states) {
        this.states.set(id, {
          state: 'error',
          error: 'The plugin host stopped unexpectedly. Reload plugins to try again.',
        })
      }
      this.clearContributions()
      this.options.onChanged()
    })
    this.host = { process: child, rpc }

    try {
      await rpc.request('start', {
        appVersion: this.options.appVersion,
        storageDir: this.options.storageDir,
        plugins: toRun.map((p) => ({
          id: p.manifest.id,
          path: p.path,
          main: `${p.path}/${p.manifest.main}`,
          commands: p.manifest.contributes.commands.map((c) => c.id),
          panels: p.manifest.contributes.panels.map((panel) => panel.id),
          settings: settingValues(
            p.manifest.contributes.settings,
            settings.pluginSettings[p.manifest.id],
          ),
        })),
      })
    } catch {
      // The exit handler above reports a host that died while starting.
    }
  }

  private async stopNow(): Promise<void> {
    const host = this.host
    this.host = null
    if (host) {
      // Give plugins a moment to run deactivate(), then end the process.
      await Promise.race([
        host.rpc.request('stop').catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
      ])
      host.process.kill()
    }
    this.states.clear()
    this.readyCommands.clear()
    this.clearContributions()
  }

  /** Forget status items, panels and badges (the host stopped). */
  private clearContributions(): void {
    this.statusItems.clear()
    this.options.onStatusItems([])
    this.readyPanels.clear()
    const repos = [...this.decorations.keys()]
    this.decorations.clear()
    for (const repo of repos) this.options.onDecorationsChanged(repo)
  }

  private onHostEvent(name: keyof MainEvents, payload: unknown): void {
    if (name === 'activated') {
      const { plugin, error } = payload as MainEvents['activated']
      this.states.set(plugin, error ? { state: 'error', error } : { state: 'running', error: null })
      this.options.onChanged()
    } else if (name === 'commands') {
      const { plugin, commands } = payload as MainEvents['commands']
      this.readyCommands.set(plugin, commands)
      this.options.onChanged()
    } else if (name === 'statusItem') {
      const item = payload as MainEvents['statusItem']
      this.statusItems.set(item.id, item)
      this.options.onStatusItems(this.getStatusItems())
    } else if (name === 'statusItemRemoved') {
      this.statusItems.delete((payload as MainEvents['statusItemRemoved']).id)
      this.options.onStatusItems(this.getStatusItems())
    } else if (name === 'panel') {
      const { plugin, panel, removed } = payload as MainEvents['panel']
      const panels = this.readyPanels.get(plugin) ?? new Set()
      if (removed) panels.delete(panel)
      else panels.add(panel)
      this.readyPanels.set(plugin, panels)
      this.options.onChanged()
    } else if (name === 'panelChanged') {
      this.options.onPanelChanged((payload as MainEvents['panelChanged']).panel)
    } else if (name === 'decorations') {
      const { plugin, repo, decorations } = payload as MainEvents['decorations']
      const byPlugin = this.decorations.get(repo) ?? new Map()
      byPlugin.set(
        plugin,
        decorations.map((d) => {
          // Only web links may be opened from a badge.
          const { url, ...rest } = d
          return { ...rest, plugin, ...(url && isWebUrl(url) ? { url } : {}) }
        }),
      )
      this.decorations.set(repo, byPlugin)
      this.options.onDecorationsChanged(repo)
    }
  }

  /** Requests the host can make on behalf of a plugin. */
  private mainMethods(): Implementation<MainMethods> {
    const { askUi, getSettings, openExternal, secrets } = this.options
    return {
      'git.run': async ({ repo, args, options }) => {
        if (typeof repo !== 'string' || !repo) throw new Error('git.run needs a repository path.')
        if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
          throw new Error('git.run needs a list of string arguments.')
        }
        const run = () => git.runGit(args, { cwd: repo, okExitCodes: options?.okExitCodes ?? [0] })
        // With an undo label, record the change so the user can undo it.
        const result = options?.undoLabel
          ? await runExclusive(repo, () =>
              git.recordOperation(repo, options.undoLabel!, { worktree: true }, run),
            )
          : await runExclusive(repo, run)
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
      },
      'repos.active': () => getSettings().activeTab,
      'repos.open': () => getSettings().openTabs.map((t) => t.path),
      'ui.showMessage': async ({ plugin, message, kind }) => {
        await askUi({ kind: 'message', plugin, message: String(message), level: kind })
      },
      'ui.showInput': async (params) => {
        const value = await askUi({ kind: 'input', ...params })
        return typeof value === 'string' ? value : undefined
      },
      'ui.showQuickPick': async (params) => {
        const value = await askUi({ kind: 'quickPick', ...params })
        return typeof value === 'number' ? value : undefined
      },
      'ui.openExternal': async ({ url }) => {
        // Only web pages: a file: or app-specific URL could run something.
        if (!isWebUrl(String(url))) throw new Error('Only http and https links can be opened.')
        await openExternal(url)
      },
      'ui.setCommitMessage': async ({ repo, message }) => {
        await askUi({ kind: 'setCommitMessage', repo, message: String(message) })
      },
      // Secrets are kept under the plugin's id, so plugins can't clash. (This
      // is for tidiness, not security: plugins are trusted code.)
      'secrets.get': ({ plugin, key }) => secrets.get(pluginSecretKey(plugin, key)),
      'secrets.set': ({ plugin, key, value }) =>
        secrets.set(pluginSecretKey(plugin, key), String(value)),
      'secrets.delete': ({ plugin, key }) => secrets.delete(pluginSecretKey(plugin, key)),
    }
  }
}
