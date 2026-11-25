/**
 * UI-side copy of the user's settings (theme, open tabs, recent repos).
 *
 * The main process owns the file on disk. This store loads it once at start-up
 * and sends every change back with `settings:update`. Updates are applied to
 * the UI immediately (optimistically) so the app feels instant.
 */
import { create } from 'zustand'
import type { Settings } from '@shared/ipc'
import { api } from '@/lib/api'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => void
}

const INITIAL: Settings = {
  theme: 'system',
  openTabs: [],
  activeTab: null,
  recentRepos: [],
  favouriteRepos: [],
  diffLayout: 'unified',
  lastCloneFolder: null,
  autoFetchMinutes: 10,
  workspaces: [],
  keybindings: {},
  editorCommand: '',
  disabledPlugins: [],
  pluginDevFolders: [],
  pluginSettings: {},
  ai: { enabled: false, provider: 'anthropic', model: '', baseUrl: '' },
  checkForUpdates: true,
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: INITIAL,
  loaded: false,

  load: async () => {
    const settings = await api.invoke('settings:get')
    set({ settings, loaded: true })
  },

  update: (patch) => {
    set({ settings: { ...get().settings, ...patch } })
    api.invoke('settings:update', patch).catch((error: unknown) => {
      console.error('Failed to save settings', error)
    })
  },
}))
