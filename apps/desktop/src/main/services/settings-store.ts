/**
 * Saves and loads user settings as JSON in Electron's per-user data folder
 * (e.g. %APPDATA%/Trellis on Windows, ~/.config/Trellis on Linux,
 * ~/Library/Application Support/Trellis on macOS).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Settings } from '@shared/ipc'

export const DEFAULT_SETTINGS: Settings = {
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
  panelLayouts: {},
  pushAfterCommit: false,
  historyColumns: ['author', 'date', 'sha'],
}

export class SettingsStore {
  private settings: Settings
  private readonly file: string

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'settings.json')
    this.settings = this.load()
  }

  get(): Settings {
    return this.settings
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = { ...this.settings, ...patch }
    this.save()
    return this.settings
  }

  private load(): Settings {
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Settings>
      // Merge over defaults so settings added in newer versions get a value.
      // `ai` is an object, so merge it too.
      return { ...DEFAULT_SETTINGS, ...saved, ai: { ...DEFAULT_SETTINGS.ai, ...saved.ai } }
    } catch {
      // Missing or corrupt file: start fresh.
      return { ...DEFAULT_SETTINGS }
    }
  }

  private save(): void {
    // Write to a temp file then rename, so a crash mid-write can't leave a
    // half-written (corrupt) settings file behind.
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.settings, null, 2))
    renameSync(tmp, this.file)
  }
}
