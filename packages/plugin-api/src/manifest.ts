/**
 * The plugin manifest: what a plugin declares in its package.json.
 *
 * A Trellis plugin is a folder (usually an npm package) whose package.json
 * has the usual `name`, `version` and `main`, plus a `trellis` section:
 *
 *   {
 *     "name": "open-on-remote",
 *     "version": "1.0.0",
 *     "main": "index.js",
 *     "engines": { "trellis": "^0.2.0" },
 *     "trellis": {
 *       "displayName": "Open on Remote",
 *       "contributes": {
 *         "commands": [{ "id": "openOnRemote.commit", "title": "Open commit on remote" }],
 *         "menus": { "commit": [{ "command": "openOnRemote.commit" }] },
 *         "settings": [{ "key": "remote", "type": "string", "default": "origin", "title": "Remote" }]
 *       }
 *     }
 *   }
 *
 * Commands, menu items and settings are declared here so Trellis can show
 * them before the plugin's code has even run. The code then supplies what
 * each command does (see api.ts).
 *
 * parseManifest() checks a package.json and explains any problem in plain
 * words, so plugin authors get a useful error in the plugin manager.
 */

/** A command shown in the command palette (and usable from menus). */
export interface CommandContribution {
  /** Unique id. Start it with your plugin's name, e.g. "openOnRemote.commit". */
  id: string
  /** Shown in the palette and in menus. */
  title: string
  /** Set false to keep it out of the palette (e.g. menu-only commands). Default true. */
  palette?: boolean
}

/** Where a plugin can add right-click menu items. */
export type MenuLocation = 'commit' | 'branch' | 'file'

export interface MenuContribution {
  /** A command id from `contributes.commands`. */
  command: string
}

/** A setting shown under the plugin in Settings > Plugins. */
export type SettingContribution = {
  /** Name used with `trellis.settings.get(key)`. */
  key: string
  title: string
  description?: string
} & (
  | { type: 'string'; default: string }
  | { type: 'boolean'; default: boolean }
  | { type: 'number'; default: number }
  | { type: 'enum'; default: string; options: string[] }
)

export interface Contributions {
  commands: CommandContribution[]
  menus: Partial<Record<MenuLocation, MenuContribution[]>>
  settings: SettingContribution[]
}

/** A checked, normalised manifest. */
export interface PluginManifest {
  /** The package name, used as the plugin's id. */
  id: string
  displayName: string
  version: string
  description: string
  /** Entry file, relative to the plugin folder. */
  main: string
  /** Trellis versions the plugin works with, e.g. "^0.2.0". */
  engine: string
  contributes: Contributions
}

export const MENU_LOCATIONS: readonly MenuLocation[] = ['commit', 'branch', 'file']

export type ManifestResult = { ok: true; manifest: PluginManifest } | { ok: false; error: string }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string' && value !== ''

/**
 * Check a parsed package.json and turn it into a PluginManifest. Returns an
 * error message (for the plugin manager) if something required is missing
 * or has the wrong type.
 */
export function parseManifest(json: unknown): ManifestResult {
  const fail = (error: string): ManifestResult => ({ ok: false, error })
  if (!isObject(json)) return fail('package.json must contain a JSON object.')

  const { name, version, main, description, engines, trellis } = json
  if (!isString(name)) return fail('package.json needs a "name".')
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
    return fail(`"${name}" isn't a valid package name (use lowercase letters, digits and -).`)
  }
  if (!isString(version)) return fail('package.json needs a "version".')
  if (!isString(main)) return fail('package.json needs a "main" entry file.')
  if (!isObject(trellis)) {
    return fail('package.json needs a "trellis" section; that is how Trellis knows it is a plugin.')
  }
  const engine = isObject(engines) ? engines.trellis : undefined
  if (!isString(engine)) {
    return fail(
      'package.json needs "engines": { "trellis": "^x.y.z" } (the Trellis versions it supports).',
    )
  }

  const contributes = trellis.contributes ?? {}
  if (!isObject(contributes)) return fail('"trellis.contributes" must be an object.')

  // Commands
  const commands: CommandContribution[] = []
  const rawCommands = contributes.commands ?? []
  if (!Array.isArray(rawCommands)) return fail('"contributes.commands" must be a list.')
  for (const command of rawCommands) {
    if (!isObject(command) || !isString(command.id) || !isString(command.title)) {
      return fail('Each command needs an "id" and a "title".')
    }
    if (commands.some((c) => c.id === command.id)) {
      return fail(`The command "${command.id}" is listed twice.`)
    }
    commands.push({
      id: command.id,
      title: command.title,
      ...(command.palette === false ? { palette: false } : {}),
    })
  }

  // Menus
  const menus: Contributions['menus'] = {}
  const rawMenus = contributes.menus ?? {}
  if (!isObject(rawMenus)) return fail('"contributes.menus" must be an object.')
  for (const [location, items] of Object.entries(rawMenus)) {
    if (!MENU_LOCATIONS.includes(location as MenuLocation)) {
      return fail(`Unknown menu "${location}". Use one of: ${MENU_LOCATIONS.join(', ')}.`)
    }
    if (!Array.isArray(items)) return fail(`"contributes.menus.${location}" must be a list.`)
    const list: MenuContribution[] = []
    for (const item of items) {
      if (!isObject(item) || !isString(item.command)) {
        return fail(`Each item in "menus.${location}" needs a "command".`)
      }
      if (!commands.some((c) => c.id === item.command)) {
        return fail(
          `"menus.${location}" uses "${item.command}", which isn't in "contributes.commands".`,
        )
      }
      list.push({ command: item.command })
    }
    menus[location as MenuLocation] = list
  }

  // Settings
  const settings: SettingContribution[] = []
  const rawSettings = contributes.settings ?? []
  if (!Array.isArray(rawSettings)) return fail('"contributes.settings" must be a list.')
  for (const setting of rawSettings) {
    const parsed = parseSetting(setting)
    if (typeof parsed === 'string') return fail(parsed)
    if (settings.some((s) => s.key === parsed.key)) {
      return fail(`The setting "${parsed.key}" is listed twice.`)
    }
    settings.push(parsed)
  }

  return {
    ok: true,
    manifest: {
      id: name,
      displayName: isString(trellis.displayName) ? trellis.displayName : name,
      version,
      description: typeof description === 'string' ? description : '',
      main,
      engine,
      contributes: { commands, menus, settings },
    },
  }
}

/** Check one setting; returns it, or an error message. */
function parseSetting(value: unknown): SettingContribution | string {
  if (!isObject(value) || !isString(value.key) || !isString(value.title)) {
    return 'Each setting needs a "key" and a "title".'
  }
  const base = {
    key: value.key,
    title: value.title,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
  }
  const wrongDefault = `The setting "${value.key}" needs a "default" of type ${String(value.type)}.`
  switch (value.type) {
    case 'string':
      return typeof value.default === 'string'
        ? { ...base, type: 'string', default: value.default }
        : wrongDefault
    case 'boolean':
      return typeof value.default === 'boolean'
        ? { ...base, type: 'boolean', default: value.default }
        : wrongDefault
    case 'number':
      return typeof value.default === 'number'
        ? { ...base, type: 'number', default: value.default }
        : wrongDefault
    case 'enum': {
      const options = value.options
      if (!Array.isArray(options) || !options.length || !options.every(isString)) {
        return `The setting "${value.key}" needs "options": a list of choices.`
      }
      if (typeof value.default !== 'string' || !options.includes(value.default)) {
        return `The setting "${value.key}" needs a "default" that is one of its options.`
      }
      return { ...base, type: 'enum', default: value.default, options }
    }
    default:
      return `The setting "${value.key}" has an unknown type; use string, boolean, number or enum.`
  }
}

/**
 * The value each of a plugin's settings has right now: the saved value if
 * it's valid for the setting's type, otherwise the default.
 */
export function settingValues(
  declared: readonly SettingContribution[],
  saved: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const setting of declared) {
    const value = saved?.[setting.key]
    const valid =
      setting.type === 'enum'
        ? typeof value === 'string' && setting.options.includes(value)
        : typeof value === setting.type
    values[setting.key] = valid ? value : setting.default
  }
  return values
}

// ---------------------------------------------------------------------------
// Engine versions
// ---------------------------------------------------------------------------

type Version = [number, number, number]

function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * Whether `version` (the running Trellis) satisfies `range` from a plugin's
 * `engines.trellis`. Supports the common forms: "*", "1.2.3", ">=1.2.3",
 * "^1.2.3" and "~1.2.3", and several of them separated by spaces (all must
 * match). Like npm, "^0.2.0" means ">=0.2.0 <0.3.0" while the major version
 * is 0, because 0.x releases may change the API.
 */
export function satisfiesEngine(version: string, range: string): boolean {
  const current = parseVersion(version)
  if (!current) return false
  const parts = range.trim().split(/\s+/)
  return parts.every((part) => {
    if (part === '*' || part === 'x') return true
    const op = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(part)!
    const wanted = parseVersion(op[2]!)
    if (!wanted) return false
    const cmp = compare(current, wanted)
    switch (op[1]) {
      case '>=':
        return cmp >= 0
      case '<=':
        return cmp <= 0
      case '>':
        return cmp > 0
      case '<':
        return cmp < 0
      case '~':
        return cmp >= 0 && current[0] === wanted[0] && current[1] === wanted[1]
      case '^':
        if (cmp < 0) return false
        if (wanted[0] > 0) return current[0] === wanted[0]
        if (wanted[1] > 0) return current[0] === 0 && current[1] === wanted[1]
        return current[0] === 0 && current[1] === 0 && current[2] === wanted[2]
      default:
        return cmp === 0
    }
  })
}
