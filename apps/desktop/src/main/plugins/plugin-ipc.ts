/**
 * Connects plugins to the rest of the app: creates the PluginManager with
 * the right folders, relays plugin UI requests to the window and back, and
 * implements the `plugins:*` IPC channels used by the UI.
 *
 * Used by registerIpcHandlers (ipc/handlers.ts).
 */
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import type { IpcArgs, IpcChannel, IpcResult, PluginUiRequest } from '@shared/ipc'
import type { SettingsStore } from '../services/settings-store'
import { assertAbsolutePath, assertString } from '../ipc/validate'
import { APP_VERSION } from '../app-version'
import { PluginManager } from './plugin-manager'
import { installFromFolder, installFromNpm, uninstall } from './install'

type PluginChannel = Extract<IpcChannel, `plugins:${string}`>
export type PluginHandlers = {
  [C in PluginChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/**
 * Built-in plugins ship in the installer's resources folder. During
 * development (and e2e tests) they come straight from the repository's
 * plugins/ folder: the built main process lives in apps/desktop/out/main.
 */
function builtInPluginsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'plugins')
    : join(import.meta.dirname, '../../../../plugins')
}

export function createPluginService(settings: SettingsStore) {
  const userData = app.getPath('userData')
  const installedDir = join(userData, 'plugins')
  const send = (channel: string, payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
  }

  // UI requests wait here until the window answers with plugins:uiResponse.
  let nextRequest = 1
  const waiting = new Map<number, (value: unknown) => void>()
  const askUi = (request: PluginUiRequest) =>
    new Promise<unknown>((resolve) => {
      if (BrowserWindow.getAllWindows().length === 0) return resolve(undefined)
      const requestId = nextRequest++
      waiting.set(requestId, resolve)
      send('plugins:ui', { requestId, request })
    })

  const manager = new PluginManager({
    appVersion: APP_VERSION,
    builtInDir: builtInPluginsDir(),
    installedDir,
    storageDir: join(userData, 'plugin-data'),
    getSettings: () => settings.get(),
    onChanged: () => send('plugins:changed', {}),
    onStatusItems: (items) => send('plugins:statusItems', items),
    askUi,
    openExternal: (url) => shell.openExternal(url),
  })

  /** Find the installed plugin with this id (built-in ones can't be removed). */
  const findPlugin = (id: string) => {
    const plugin = manager.list().find((p) => p.id === id)
    if (!plugin) throw new Error(`No plugin called ${id}.`)
    return plugin
  }

  const handlers: PluginHandlers = {
    'plugins:list': () => manager.list(),
    'plugins:statusItems': () => manager.getStatusItems(),
    'plugins:reload': () => manager.reload(),

    'plugins:setEnabled': async (id, enabled) => {
      assertString(id, 'id')
      const disabled = settings.get().disabledPlugins.filter((p) => p !== id)
      settings.update({ disabledPlugins: enabled ? disabled : [...disabled, id] })
      // Restarting the host is the simple, reliable way to start or stop one plugin.
      await manager.reload()
    },

    'plugins:executeCommand': (command, args) => {
      assertString(command, 'command')
      if (typeof args !== 'object' || args === null) throw new TypeError('args must be an object')
      return manager.executeCommand(command, args)
    },

    'plugins:uiResponse': (requestId, value) => {
      waiting.get(requestId)?.(value)
      waiting.delete(requestId)
    },

    'plugins:installFromFolder': async (folder) => {
      assertAbsolutePath(folder, 'folder')
      const id = await installFromFolder(folder, installedDir, APP_VERSION)
      await manager.reload()
      return id
    },

    'plugins:installFromNpm': async (name) => {
      assertString(name, 'name')
      const id = await installFromNpm(name, installedDir, join(userData, 'plugin-tmp'), APP_VERSION)
      await manager.reload()
      return id
    },

    'plugins:uninstall': async (id) => {
      assertString(id, 'id')
      const plugin = findPlugin(id)
      if (plugin.source !== 'installed') {
        throw new Error(
          plugin.source === 'builtin'
            ? 'Built-in plugins can’t be uninstalled; turn them off instead.'
            : 'This is a development folder; remove it from the list instead.',
        )
      }
      await manager.dispose() // stop it before deleting its files
      await uninstall(plugin.path)
      await manager.start()
    },

    'plugins:addDevFolder': async (folder) => {
      assertAbsolutePath(folder, 'folder')
      const folders = settings.get().pluginDevFolders.filter((f) => f !== folder)
      settings.update({ pluginDevFolders: [...folders, folder] })
      await manager.reload()
    },

    'plugins:removeDevFolder': async (folder) => {
      assertString(folder, 'folder')
      settings.update({
        pluginDevFolders: settings.get().pluginDevFolders.filter((f) => f !== folder),
      })
      await manager.reload()
    },

    'plugins:setSetting': (id, key, value) => {
      assertString(id, 'id')
      assertString(key, 'key')
      const all = settings.get().pluginSettings
      settings.update({ pluginSettings: { ...all, [id]: { ...all[id], [key]: value } } })
      manager.settingsChanged(id)
    },
  }

  return { manager, handlers }
}
