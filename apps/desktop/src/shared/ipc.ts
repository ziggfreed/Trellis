/**
 * The IPC contract: every request the UI (renderer) can make to the main
 * process, with its argument and result types.
 *
 * HOW TO ADD A NEW IPC CALL
 *   1. Add an entry to `IpcContract` below: `'area:action': { args: [...]; result: ... }`.
 *   2. Implement it in `src/main/ipc/handlers.ts` (TypeScript will complain until you do).
 *   3. Call it from the UI with `api.invoke('area:action', ...args)` (see renderer/src/lib/api.ts).
 *
 * Only plain data (objects, arrays, strings, numbers, booleans, null) can cross
 * the IPC boundary. Functions, class instances and Dates do not survive.
 */
import type { GitInstallation, HeadState } from '@trellis/git/types'

export type { GitInstallation, HeadState }

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
}

export interface AppInfo {
  version: string
  /** Operating system, e.g. 'win32', 'darwin' or 'linux'. */
  platform: string
}

/** Result of asking to open a folder as a repository. */
export type OpenRepoResult =
  { ok: true; repo: RepoTab } | { ok: false; reason: 'not-a-repo' | 'not-found'; path: string }

/** Live information about a repo, shown in the UI. */
export interface RepoSummary {
  path: string
  head: HeadState
}

export interface IpcContract {
  'app:getInfo': { args: []; result: AppInfo }
  'git:checkInstallation': { args: []; result: GitInstallation }

  'settings:get': { args: []; result: Settings }
  /** Merge a partial update into the saved settings. Returns the new settings. */
  'settings:update': { args: [patch: Partial<Settings>]; result: Settings }

  /** Show the native "choose folder" dialog. Returns null if cancelled. */
  'repo:pickFolder': { args: []; result: string | null }
  /** Check that `path` is (inside) a git repo and return its root. */
  'repo:resolve': { args: [path: string]; result: OpenRepoResult }
  'repo:getSummary': { args: [path: string]; result: RepoSummary }
  /** Open the repo folder in the system file manager. */
  'repo:showInFolder': { args: [path: string]; result: void }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

/** The API the preload script exposes on `window.trellis`. */
export interface TrellisBridge {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
}

/**
 * Runtime list of allowed channels. The preload script refuses anything not in
 * this list. The `Record<IpcChannel, true>` type makes TypeScript fail if a
 * channel is added to `IpcContract` but forgotten here.
 */
const channelMap: Record<IpcChannel, true> = {
  'app:getInfo': true,
  'git:checkInstallation': true,
  'settings:get': true,
  'settings:update': true,
  'repo:pickFolder': true,
  'repo:resolve': true,
  'repo:getSummary': true,
  'repo:showInFolder': true,
}
export const IPC_CHANNELS = Object.keys(channelMap) as IpcChannel[]
