/**
 * Implementations of every IPC call defined in src/shared/ipc.ts.
 *
 * The `IpcHandlers` type forces this object to have exactly one function per
 * channel, with the right argument and result types. If you add a channel to
 * the contract, TypeScript will point you here.
 *
 * Arguments come from the renderer, so validate them first (see ./validate.ts).
 */
import { basename, join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import * as git from '@trellis/git'
import {
  IPC_CHANNELS,
  type CreateRepoResult,
  type IpcArgs,
  type IpcChannel,
  type IpcEvent,
  type IpcEvents,
  type IpcResult,
} from '@shared/ipc'
import type { SettingsStore } from '../services/settings-store'
import { RepoWatcher } from '../services/repo-watcher'
import { cancelOperation, endOperation, startOperation } from '../services/operations'
import { getLogPage, keepLogReaders } from '../services/log-cache'
import {
  assertDiffTarget,
  assertPage,
  assertScope,
  assertSha,
  assertString,
  assertStringArray,
} from './validate'

type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => Promise<IpcResult<C>> | IpcResult<C>
}

/** Send an event to every open window. */
export function sendToAllWindows<E extends IpcEvent>(event: E, payload: IpcEvents[E]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(event, payload)
}

/** Turn a successfully created repo folder into a tab, or explain what went wrong. */
async function toCreateResult(dir: string): Promise<CreateRepoResult> {
  const root = await git.getRepoRoot(dir)
  return root
    ? { ok: true, repo: { path: root, name: basename(root) } }
    : { ok: false, message: `${dir} is not a git repository.` }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createHandlers(settings: SettingsStore, watcher: RepoWatcher): IpcHandlers {
  return {
    'app:getInfo': () => ({ version: app.getVersion(), platform: process.platform }),

    'git:checkInstallation': () => git.checkGitInstallation(),

    'settings:get': () => settings.get(),
    'settings:update': (patch) => {
      if (typeof patch !== 'object' || patch === null)
        throw new TypeError('patch must be an object')
      return settings.update(patch)
    },

    'dialog:pickFolder': async (options) => {
      const window = BrowserWindow.getFocusedWindow()
      const dialogOptions = {
        title: options?.title ?? 'Choose folder',
        properties: ['openDirectory' as const, 'createDirectory' as const],
      }
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },

    'repo:resolve': async (path) => {
      assertString(path, 'path')
      if (!existsSync(path)) return { ok: false, reason: 'not-found', path }
      const root = await git.getRepoRoot(path)
      if (!root) return { ok: false, reason: 'not-a-repo', path }
      return { ok: true, repo: { path: root, name: basename(root) } }
    },

    'repo:showInFolder': async (path) => {
      assertString(path, 'path')
      const error = await shell.openPath(path)
      if (error) throw new Error(error)
    },

    'repo:setWatched': (paths) => {
      assertStringArray(paths, 'paths')
      watcher.setWatched(paths)
      keepLogReaders(paths)
    },

    'repo:getStatus': (path) => {
      assertString(path, 'path')
      return git.getStatus(path)
    },

    'repo:getLog': (path, page) => {
      assertString(path, 'path')
      assertPage(page)
      assertScope(page.scope)
      return getLogPage(path, page.scope, page.skip, page.limit)
    },

    'repo:searchCommits': (path, query, scope) => {
      assertString(path, 'path')
      if (typeof query !== 'string') throw new TypeError('query must be a string')
      assertScope(scope)
      return git.searchCommits(path, query, { scope })
    },

    'repo:getRefs': (path) => {
      assertString(path, 'path')
      return git.getRefs(path)
    },

    'repo:getRemotes': (path) => {
      assertString(path, 'path')
      return git.getRemotes(path)
    },

    'repo:getStashes': (path) => {
      assertString(path, 'path')
      return git.getStashes(path)
    },

    'repo:getCommit': (path, sha) => {
      assertString(path, 'path')
      assertSha(sha, 'sha')
      return git.getCommitDetails(path, sha)
    },

    'repo:getFileDiff': (path, target) => {
      assertString(path, 'path')
      assertDiffTarget(target)
      return git.getFileDiffContents(path, target)
    },

    'repo:clone': async (operationId, url, targetDir) => {
      assertString(operationId, 'operationId')
      assertString(url, 'url')
      assertString(targetDir, 'targetDir')
      if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
        return { ok: false, message: `${targetDir} already exists and is not empty.` }
      }
      const signal = startOperation(operationId)
      try {
        await git.cloneRepository(url, targetDir, {
          signal,
          onProgress: (progress) =>
            sendToAllWindows('operation:progress', { operationId, ...progress }),
        })
        return await toCreateResult(targetDir)
      } catch (error) {
        if (signal.aborted) return { ok: false, message: 'Clone cancelled.' }
        return { ok: false, message: errorMessage(error) }
      } finally {
        endOperation(operationId)
      }
    },

    'repo:init': async (dir) => {
      assertString(dir, 'dir')
      if (existsSync(join(dir, '.git'))) {
        return { ok: false, message: `${dir} is already a git repository.` }
      }
      try {
        await git.initRepository(dir)
        return await toCreateResult(dir)
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    },

    'operation:cancel': (operationId) => {
      assertString(operationId, 'operationId')
      cancelOperation(operationId)
    },
  }
}

/**
 * Connect every handler to Electron's `ipcMain`. Call once at start-up.
 * Returns the repo watcher so the caller can stop it when the app quits.
 */
export function registerIpcHandlers(settings: SettingsStore): RepoWatcher {
  const watcher = new RepoWatcher((path, scope) =>
    sendToAllWindows('repo:changed', { path, scope }),
  )
  const handlers = createHandlers(settings, watcher)
  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }
  return watcher
}
