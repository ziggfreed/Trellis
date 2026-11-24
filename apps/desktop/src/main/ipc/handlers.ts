/**
 * Implementations of every IPC call defined in src/shared/ipc.ts.
 *
 * The `IpcHandlers` type forces this object to have exactly one function per
 * channel, with the right argument and result types. If you add a channel to
 * the contract, TypeScript will point you here.
 *
 * Arguments come from the renderer, so treat them as untrusted input and
 * validate them (see `assertString`).
 */
import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { checkGitInstallation, getHead, getRepoRoot } from '@trellis/git'
import { IPC_CHANNELS, type IpcArgs, type IpcChannel, type IpcResult } from '@shared/ipc'
import type { SettingsStore } from '../services/settings-store'

type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

export function createHandlers(settings: SettingsStore): IpcHandlers {
  return {
    'app:getInfo': () => ({ version: app.getVersion(), platform: process.platform }),

    'git:checkInstallation': () => checkGitInstallation(),

    'settings:get': () => settings.get(),
    'settings:update': (patch) => {
      if (typeof patch !== 'object' || patch === null)
        throw new TypeError('patch must be an object')
      return settings.update(patch)
    },

    'repo:pickFolder': async () => {
      const window = BrowserWindow.getFocusedWindow()
      const options = { title: 'Open repository', properties: ['openDirectory' as const] }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },

    'repo:resolve': async (path) => {
      assertString(path, 'path')
      if (!existsSync(path)) return { ok: false, reason: 'not-found', path }
      const root = await getRepoRoot(path)
      if (!root) return { ok: false, reason: 'not-a-repo', path }
      return { ok: true, repo: { path: root, name: basename(root) } }
    },

    'repo:getSummary': async (path) => {
      assertString(path, 'path')
      return { path, head: await getHead(path) }
    },

    'repo:showInFolder': async (path) => {
      assertString(path, 'path')
      const error = await shell.openPath(path)
      if (error) throw new Error(error)
    },
  }
}

/** Connect every handler to Electron's `ipcMain`. Call once at start-up. */
export function registerIpcHandlers(settings: SettingsStore): void {
  const handlers = createHandlers(settings)
  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }
}
