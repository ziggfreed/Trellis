/**
 * The plugin host: a separate process (Electron utilityProcess) that runs
 * every enabled plugin's code.
 *
 * Running plugins here, rather than in the main process or the UI, means a
 * slow or crashing plugin can't freeze or take down Trellis: at worst this
 * process dies and the plugin manager reports it.
 *
 * For each plugin this file builds a `trellis` API object (see
 * @trellis/plugin-api) and calls the plugin's activate(). Calls that need
 * the app (running git, showing a dialog...) become RPC requests to the
 * main process; events from the app (tab switched, repo changed, settings
 * changed) arrive as RPC events and are passed to the plugin's listeners.
 *
 * Started and stopped by PluginManager (plugin-manager.ts).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  CommandArgs,
  Disposable,
  PluginContext,
  PluginModule,
  StatusBarItem,
  TrellisApi,
} from '@trellis/plugin-api'
import { createRpc } from './rpc'
import type {
  HostEvents,
  HostMethods,
  HostPlugin,
  Implementation,
  MainEvents,
  MainMethods,
} from './protocol'

/** A running plugin and everything it has registered. */
interface Running {
  plugin: HostPlugin
  module: PluginModule | null
  context: PluginContext
  settings: Record<string, unknown>
  activeRepoListeners: Set<(repo: string | null) => void>
  repoChangeListeners: Set<(repo: string) => void>
  settingsListeners: Set<() => void>
}

const running = new Map<string, Running>()
/** Registered command id → the plugin and code that runs it. */
const commands = new Map<string, { plugin: string; run: (args: CommandArgs) => unknown }>()
let appVersion = '0.0.0'
let storageDir = ''

const rpc = createRpc<MainMethods, MainEvents>(
  (message) => process.parentPort.postMessage(message),
  { start, executeCommand, stop } satisfies Implementation<HostMethods & { stop(): void }>,
  (name, payload) => onEvent(name as keyof HostEvents, payload),
)
process.parentPort.on('message', (event: { data: unknown }) => rpc.receive(event.data))

// A plugin's stray error must not stop the other plugins.
process.on('uncaughtException', (error) => console.error('[plugin]', error))
process.on('unhandledRejection', (error) => console.error('[plugin]', error))

/** Call a listener without letting its error escape. */
function safely<A extends unknown[]>(listener: (...args: A) => unknown, ...args: A) {
  try {
    const result = listener(...args)
    if (result instanceof Promise) result.catch((error) => console.error('[plugin]', error))
  } catch (error) {
    console.error('[plugin]', error)
  }
}

/** A Disposable that removes `value` from `set`. */
function addTo<T>(set: Set<T>, value: T): Disposable {
  set.add(value)
  return { dispose: () => set.delete(value) }
}

// ---------------------------------------------------------------------------
// Methods main calls
// ---------------------------------------------------------------------------

async function start(params: Parameters<HostMethods['start']>[0]) {
  appVersion = params.appVersion
  storageDir = params.storageDir
  // Activate one at a time, so plugins start in a predictable order.
  for (const plugin of params.plugins) await activate(plugin)
}

async function executeCommand({ command, args }: Parameters<HostMethods['executeCommand']>[0]) {
  const registered = commands.get(command)
  if (!registered) {
    throw new Error(
      `The command “${command}” isn’t available. Its plugin may have failed to start; see Settings > Plugins.`,
    )
  }
  return await registered.run(args)
}

/** Let every plugin clean up (main calls this before ending the process). */
async function stop() {
  for (const entry of running.values()) {
    try {
      await entry.module?.deactivate?.()
    } catch (error) {
      console.error('[plugin]', error)
    }
    for (const disposable of entry.context.subscriptions) safely(() => disposable.dispose())
  }
}

function onEvent(name: keyof HostEvents, payload: unknown) {
  if (name === 'activeRepo') {
    const { repo } = payload as HostEvents['activeRepo']
    for (const entry of running.values()) {
      for (const listener of entry.activeRepoListeners) safely(listener, repo)
    }
  } else if (name === 'repoChanged') {
    const { repo } = payload as HostEvents['repoChanged']
    for (const entry of running.values()) {
      for (const listener of entry.repoChangeListeners) safely(listener, repo)
    }
  } else if (name === 'settings') {
    const { plugin, values } = payload as HostEvents['settings']
    const entry = running.get(plugin)
    if (!entry) return
    entry.settings = values
    for (const listener of entry.settingsListeners) safely(listener)
  }
}

// ---------------------------------------------------------------------------
// Loading a plugin
// ---------------------------------------------------------------------------

async function activate(plugin: HostPlugin) {
  const entry: Running = {
    plugin,
    module: null,
    context: await createContext(plugin),
    settings: plugin.settings,
    activeRepoListeners: new Set(),
    repoChangeListeners: new Set(),
    settingsListeners: new Set(),
  }
  running.set(plugin.id, entry)
  try {
    // import() loads both ES modules and CommonJS files.
    const module = (await import(pathToFileURL(plugin.main).href)) as Partial<PluginModule> & {
      default?: Partial<PluginModule>
    }
    // A CommonJS plugin's exports arrive as `default`.
    const activateFn = module.activate ?? module.default?.activate
    if (typeof activateFn !== 'function') {
      throw new Error(`${plugin.main} doesn’t export an activate() function.`)
    }
    entry.module = {
      activate: activateFn,
      ...((module.deactivate ?? module.default?.deactivate)
        ? { deactivate: (module.deactivate ?? module.default?.deactivate)! }
        : {}),
    }
    await activateFn(createApi(entry), entry.context)
    rpc.emit('activated', { plugin: plugin.id })
  } catch (error) {
    rpc.emit('activated', {
      plugin: plugin.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/** The plugin's context, including its storage (a JSON file per plugin). */
async function createContext(plugin: HostPlugin): Promise<PluginContext> {
  // Plugin ids can contain "/" (scoped npm names); keep the file name flat.
  const file = join(storageDir, `${plugin.id.replace(/[/\\]/g, '__')}.json`)
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  } catch {
    // No storage yet (or unreadable): start empty.
  }
  const save = async () => {
    await mkdir(storageDir, { recursive: true })
    await writeFile(file, JSON.stringify(data, null, 2))
  }
  return {
    id: plugin.id,
    path: plugin.path,
    subscriptions: [],
    storage: {
      get: <T>(key: string) => data[key] as T | undefined,
      set: async (key, value) => {
        data[key] = value
        await save()
      },
      delete: async (key) => {
        delete data[key]
        await save()
      },
    },
  }
}

// ---------------------------------------------------------------------------
// The API object each plugin receives
// ---------------------------------------------------------------------------

let nextStatusItem = 1

function createApi(entry: Running): TrellisApi {
  const pluginId = entry.plugin.id
  return {
    version: appVersion,

    commands: {
      register(id, run) {
        if (!entry.plugin.commands.includes(id)) {
          throw new Error(
            `Add “${id}” to "contributes.commands" in package.json before registering it.`,
          )
        }
        commands.set(id, { plugin: pluginId, run })
        const announce = () =>
          rpc.emit('commands', {
            plugin: pluginId,
            commands: [...commands].filter(([, c]) => c.plugin === pluginId).map(([id]) => id),
          })
        announce()
        return {
          dispose: () => {
            if (commands.get(id)?.run === run) commands.delete(id)
            announce()
          },
        }
      },
    },

    repos: {
      active: () => rpc.request('repos.active'),
      open: () => rpc.request('repos.open'),
      onDidChangeActive: (listener) => addTo(entry.activeRepoListeners, listener),
      onDidChange: (listener) => addTo(entry.repoChangeListeners, listener),
    },

    git: {
      run: (repo, args, options = {}) =>
        rpc.request('git.run', { plugin: pluginId, repo, args, options }),
    },

    ui: {
      showMessage: (message, kind = 'info') =>
        void rpc.request('ui.showMessage', { plugin: pluginId, message, kind }),
      showInput: (options) => rpc.request('ui.showInput', options),
      async showQuickPick(items, options = {}) {
        const index = await rpc.request('ui.showQuickPick', {
          // Only plain labels cross to the UI; the plugin gets its own item back.
          items: items.map(({ label, detail }) => ({
            label: String(label),
            ...(detail ? { detail: String(detail) } : {}),
          })),
          ...(options.placeholder ? { placeholder: options.placeholder } : {}),
        })
        return index === undefined ? undefined : items[index]
      },
      openExternal: (url) => rpc.request('ui.openExternal', { url }),
      setCommitMessage: (repo, message) => rpc.request('ui.setCommitMessage', { repo, message }),
      createStatusBarItem: () => createStatusItem(pluginId),
    },

    settings: {
      get: <T>(key: string) => entry.settings[key] as T,
      onDidChange: (listener) => addTo(entry.settingsListeners, listener),
    },
  }
}

/**
 * A status bar item: setting text/tooltip/command sends the new state to
 * the UI (batched, so setting all three at once sends one update).
 */
function createStatusItem(plugin: string): StatusBarItem {
  const id = `${plugin}:${nextStatusItem++}`
  const state = { text: '', tooltip: '', command: undefined as string | undefined }
  let queued = false
  let disposed = false
  const update = () => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!disposed) rpc.emit('statusItem', { id, plugin, ...state })
    })
  }
  return {
    get text() {
      return state.text
    },
    set text(value) {
      state.text = String(value)
      update()
    },
    get tooltip() {
      return state.tooltip
    },
    set tooltip(value) {
      state.tooltip = String(value)
      update()
    },
    get command() {
      return state.command
    },
    set command(value) {
      state.command = value
      update()
    },
    dispose() {
      disposed = true
      rpc.emit('statusItemRemoved', { id })
    },
  }
}
