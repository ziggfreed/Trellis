/**
 * Implementations of every IPC call defined in src/shared/ipc.ts.
 *
 * The `IpcHandlers` type forces this object to have exactly one function per
 * channel, with the right argument and result types. If you add a channel to
 * the contract, TypeScript will point you here.
 *
 * Arguments come from the renderer, so validate them first (see ./validate.ts).
 */
import { basename, join, relative, resolve } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { app, dialog, ipcMain, safeStorage, shell, BrowserWindow } from 'electron'
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
import { CommandLog } from '../services/command-log'
import { AutoFetcher } from '../services/auto-fetch'
import { openEditor, openTerminal } from '../services/external-apps'
import { AskpassServer } from '../services/askpass'
import { askUser, cancelAllPrompts } from '../services/auth-prompts'
import { createWriteHandlers } from './write-handlers'
import { createPluginService } from '../plugins/plugin-ipc'
import { createAiService } from '../ai/ai-ipc'
import { SecretStore, safeStorageEncryptor } from '../services/secret-store'
import { scanForRepos } from '../services/scan-repos'
import {
  assertDiffTarget,
  assertFileInRepo,
  assertPage,
  assertAbsolutePath,
  assertCommitFilter,
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

export function createHandlers(
  settings: SettingsStore,
  watcher: RepoWatcher,
  commandLog: CommandLog,
  autoFetcher: AutoFetcher,
  plugins: ReturnType<typeof createPluginService>,
  ai: ReturnType<typeof createAiService>,
): IpcHandlers {
  return {
    ...plugins.handlers,
    ...ai.handlers,
    ...createWriteHandlers(commandLog, (operationId, phase, percent) =>
      sendToAllWindows('operation:progress', { operationId, phase, percent }),
    ),

    'app:getInfo': () => ({ version: app.getVersion(), platform: process.platform }),

    'git:checkInstallation': () => git.checkGitInstallation(),

    'git:getIdentity': (repo) => {
      if (repo !== null) assertString(repo, 'repo')
      return git.getGitIdentity(repo)
    },

    'git:setIdentity': async (name, email) => {
      assertString(name, 'name')
      assertString(email, 'email')
      if (!name.trim() || !email.trim()) throw new Error('Enter both a name and an email.')
      await git.setGlobalGitIdentity(name.trim(), email.trim())
    },

    'settings:get': () => settings.get(),
    'settings:update': (patch) => {
      if (typeof patch !== 'object' || patch === null) {
        throw new TypeError('patch must be an object')
      }
      const before = settings.get()
      let updated = settings.update(patch)
      if ('autoFetchMinutes' in patch) autoFetcher.configure(updated.autoFetchMinutes)
      // Keep nested settings whole when a patch only sends some fields.
      if ('ai' in patch) updated = settings.update({ ai: { ...before.ai, ...patch.ai } })
      // Plugins can follow which repository is open.
      if (updated.activeTab !== before.activeTab) {
        plugins.manager.activeRepoChanged(updated.activeTab)
      }
      // Plugin settings are edited in Settings > Plugins; pass on the new values.
      if ('pluginSettings' in patch) {
        for (const id of Object.keys(updated.pluginSettings)) plugins.manager.settingsChanged(id)
      }
      return updated
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

    'repo:scanFolder': (folder) => {
      assertAbsolutePath(folder, 'folder')
      return scanForRepos(folder, git.getRepoRoot)
    },

    'repo:showInFolder': async (path) => {
      assertString(path, 'path')
      const error = await shell.openPath(path)
      if (error) throw new Error(error)
    },

    'repo:openFile': async (path, file) => {
      assertString(path, 'path')
      assertString(file, 'file')
      // Only open files inside the repository.
      const full = resolve(path, file)
      if (relative(path, full).startsWith('..')) throw new Error('File is outside the repository')
      const error = await shell.openPath(full)
      if (error) throw new Error(error)
    },

    'shell:openTerminal': (path) => {
      assertString(path, 'path')
      return openTerminal(path)
    },

    'shell:openEditor': (path, file) => {
      assertString(path, 'path')
      if (file !== undefined) assertFileInRepo(path, file)
      return openEditor(path, file, settings.get().editorCommand)
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

    'repo:findCommits': (path, filter, scope) => {
      assertString(path, 'path')
      assertCommitFilter(filter)
      assertScope(scope)
      return git.findCommits(path, filter, { scope })
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

/** Things started at launch that must be stopped when the app quits. */
export interface IpcServices {
  watcher: RepoWatcher
  dispose: () => void
}

/**
 * Connect every handler to Electron's `ipcMain` and start the services they
 * use: the file watcher, the git command log, and the askpass server that
 * lets git ask the user for passwords. Call once at start-up.
 */
export async function registerIpcHandlers(settings: SettingsStore): Promise<IpcServices> {
  const secrets = new SecretStore(app.getPath('userData'), safeStorageEncryptor(safeStorage))
  const plugins = createPluginService(settings, secrets)
  const ai = createAiService(settings, secrets)
  const watcher = new RepoWatcher((path, scope) => {
    sendToAllWindows('repo:changed', { path, scope })
    plugins.manager.repoChanged(path)
  })
  const commandLog = new CommandLog((entry) => sendToAllWindows('git:command', entry))

  // The helper scripts must be real files git can run, so they live in the
  // user data folder rather than inside the app package.
  const askpass = new AskpassServer(join(app.getPath('userData'), 'askpass'), (prompt) =>
    askUser(prompt, (payload) => {
      const windows = BrowserWindow.getAllWindows()
      for (const window of windows) window.webContents.send('auth:prompt', payload)
      return windows.length > 0
    }),
  )
  try {
    git.setGitEnvironment(await askpass.start())
  } catch (error) {
    // Without it, git falls back to saved credentials only; everything else works.
    console.warn('Could not start the credential prompt helper:', error)
  }

  const autoFetcher = new AutoFetcher(
    () => watcher.watchedPaths,
    (path) => sendToAllWindows('repo:changed', { path, scope: 'all' }),
  )
  autoFetcher.configure(settings.get().autoFetchMinutes)

  const handlers = createHandlers(settings, watcher, commandLog, autoFetcher, plugins, ai)
  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args))
  }

  // Load plugins in the background; the UI asks for their state when it's ready.
  void plugins.manager.start().catch((error) => console.error('Could not start plugins:', error))

  return {
    watcher,
    dispose: () => {
      void plugins.manager.dispose()
      plugins.dispose()
      ai.dispose()
      watcher.dispose()
      autoFetcher.dispose()
      commandLog.dispose()
      askpass.close()
      cancelAllPrompts()
    },
  }
}
